import { STR } from '../../config/strings.de';
import {
  ALBUM_PAGES,
  COLORWAYS,
  GOLD_REWARD_ID,
  STICKERS,
  stickersOfPage,
  type StickerDef,
} from '../../config/stickers';
import type { Sfx } from '../../audio/Sfx';
import type { SaveManager } from '../../save/SaveManager';

export interface AlbumCallbacks {
  onBack: () => void;
  /** Nach einem Belohnungs-Claim (Game persistiert + Menue-Vorschau auffrischen). */
  onClaimed: () => void;
}

/**
 * Sticker-Album: 7 Seiten-Tabs, Sticker-Grid mit Rarity-Rahmen,
 * Detail-Panel, Seiten-Belohnungen (Kerne/Farbvarianten) und NEU-Badges
 * seit dem letzten Besuch. Geheime Sticker zeigen nur "???" + Raetsel.
 */
export class AlbumScreen {
  private readonly root: HTMLElement;
  private tabsEl!: HTMLElement;
  private gridEl!: HTMLElement;
  private rewardEl!: HTMLElement;
  private detailEl!: HTMLElement;
  private totalEl!: HTMLElement;
  private totalFillEl!: HTMLElement;
  private goldEl!: HTMLElement;
  private activePage = 'start';
  private detailId: string | null = null;

  constructor(
    private readonly save: SaveManager,
    private readonly sfx: Sfx,
    private readonly cb: AlbumCallbacks,
  ) {
    this.root = document.getElementById('screen-album') as HTMLElement;
    this.root.innerHTML = `
      <h2 class="title-glow album-title">🏅 ${STR.albumTitle}</h2>
      <div class="album-total">
        <div class="album-total-bar"><div class="album-total-fill"></div></div>
        <span class="album-total-text"></span>
      </div>
      <div class="album-tabs"></div>
      <div class="album-wrap panel">
        <div class="album-grid"></div>
        <div class="album-reward"></div>
      </div>
      <div class="album-detail"></div>
      <div class="album-gold"></div>
      <button class="btn album-back" data-nav-back>${STR.back}</button>
    `;
    this.tabsEl = this.root.querySelector('.album-tabs') as HTMLElement;
    this.gridEl = this.root.querySelector('.album-grid') as HTMLElement;
    this.rewardEl = this.root.querySelector('.album-reward') as HTMLElement;
    this.detailEl = this.root.querySelector('.album-detail') as HTMLElement;
    this.totalEl = this.root.querySelector('.album-total-text') as HTMLElement;
    this.totalFillEl = this.root.querySelector('.album-total-fill') as HTMLElement;
    this.goldEl = this.root.querySelector('.album-gold') as HTMLElement;
    (this.root.querySelector('.album-back') as HTMLButtonElement).addEventListener('click', () => this.cb.onBack());
  }

  render(): void {
    const data = this.save.data;
    const total = STICKERS.length;
    const got = STICKERS.filter((s) => data.stickers[s.id]).length;
    this.totalEl.textContent = STR.albumTotal(got, total);
    this.totalFillEl.style.width = `${Math.round((got / total) * 100)}%`;

    // Tabs mit Seiten-Fortschritt + NEU-Punkt
    this.tabsEl.innerHTML = '';
    for (const page of ALBUM_PAGES) {
      const defs = stickersOfPage(page.id);
      const unlocked = defs.filter((s) => data.stickers[s.id]).length;
      const hasNew = defs.some((s) => this.isNew(s.id));
      const btn = document.createElement('button');
      btn.className = `album-tab${page.id === this.activePage ? ' active' : ''}`;
      btn.dataset.key = `album-tab-${page.id}`;
      btn.innerHTML = `${page.icon} ${STR.albumPages[page.id] ?? page.id}
        <span class="album-tab-count">${STR.albumProgress(unlocked, defs.length)}</span>
        ${hasNew ? '<span class="album-dot"></span>' : ''}`;
      btn.addEventListener('click', () => {
        this.activePage = page.id;
        this.detailId = null;
        this.render();
      });
      this.tabsEl.appendChild(btn);
    }

    this.renderGrid();
    this.renderReward();
    this.renderDetail();
    this.renderGold(got, total);
  }

  private renderGrid(): void {
    const data = this.save.data;
    this.gridEl.innerHTML = '';
    let revealIdx = 0;
    for (const def of stickersOfPage(this.activePage)) {
      const unlockedAt = data.stickers[def.id];
      const info = STR.stickers[def.id];
      const card = document.createElement('button');
      card.dataset.key = `sticker-${def.id}`;
      card.className = `album-sticker rarity-${def.rarity}${unlockedAt ? ' unlocked' : ' locked'}`;
      const isNew = this.isNew(def.id);
      if (isNew && !this.save.data.settings.reduceFx) {
        card.classList.add('reveal');
        card.style.animationDelay = `${revealIdx++ * 0.12}s`;
      }
      const progress = this.progressLabel(def);
      if (!unlockedAt && def.secret) {
        card.innerHTML = `
          <span class="album-sticker-icon">❓</span>
          <span class="album-sticker-name">${STR.albumSecretName}</span>
        `;
      } else {
        card.innerHTML = `
          <span class="album-sticker-icon">${def.icon}</span>
          <span class="album-sticker-name">${info?.name ?? def.id}</span>
          ${!unlockedAt && progress ? `<span class="album-sticker-progress">${progress}</span>` : ''}
          ${isNew ? `<span class="album-new-badge">${STR.albumNew}</span>` : ''}
        `;
      }
      card.addEventListener('click', () => {
        this.detailId = def.id;
        this.renderDetail();
      });
      this.gridEl.appendChild(card);
    }
  }

  /** Zaehler-Fortschritt fuer gesperrte Sticker ("7/15"). */
  private progressLabel(def: StickerDef): string | null {
    const t = def.trigger;
    if (t.kind === 'counter' && t.goal > 1) {
      return STR.albumProgress(Math.min(this.counterValue(t.counter), t.goal), t.goal);
    }
    if (t.kind === 'counterSet') {
      const done = t.counters.filter((c) => this.counterValue(c) >= 1).length;
      return STR.albumProgress(done, t.counters.length);
    }
    return null;
  }

  private counterValue(name: string): number {
    const d = this.save.data;
    if (name === 'kills') return d.stats.totalKills;
    if (name === 'runs') return d.stats.totalRuns;
    return d.stickerCounters[name] ?? 0;
  }

  private renderReward(): void {
    const data = this.save.data;
    const page = ALBUM_PAGES.find((p) => p.id === this.activePage);
    if (!page) return;
    const defs = stickersOfPage(page.id);
    const complete = defs.every((s) => data.stickers[s.id]);
    const claimed = data.stickerPageRewards.includes(page.id);
    const label = page.reward.kind === 'cores'
      ? STR.albumRewardCores(page.reward.amount)
      : STR.albumRewardColorway(STR.colorways[page.reward.colorwayId] ?? page.reward.colorwayId);
    const chip = page.reward.kind === 'colorway'
      ? `<span class="color-chip" style="background:#${(COLORWAYS.find((c) => c.id === (page.reward as { colorwayId: string }).colorwayId)?.body ?? 0xffffff).toString(16).padStart(6, '0')}"></span>`
      : '';

    if (claimed) {
      this.rewardEl.innerHTML = `<span class="album-reward-done">✔ ${label} ${chip}</span>`;
    } else if (complete) {
      this.rewardEl.innerHTML = `
        <span>${label} ${chip}</span>
        <button class="btn btn-gold pulse-soft album-claim">${STR.albumClaim}</button>
      `;
      (this.rewardEl.querySelector('.album-claim') as HTMLButtonElement).addEventListener('click', () => {
        this.claim(page.id);
      });
    } else {
      this.rewardEl.innerHTML = `<span class="album-reward-locked text-dim">${label} ${chip} — ${STR.albumRewardLocked}</span>`;
    }
  }

  private renderGold(got: number, total: number): void {
    const data = this.save.data;
    const claimed = data.stickerPageRewards.includes(GOLD_REWARD_ID);
    if (claimed) {
      this.goldEl.innerHTML = `<span class="album-reward-done">✔ ${STR.albumGoldReward}</span>`;
    } else if (got >= total) {
      this.goldEl.innerHTML = `<button class="btn btn-gold pulse-soft album-claim-gold">🏆 ${STR.albumClaim} — ${STR.albumGoldReward}</button>`;
      (this.goldEl.querySelector('.album-claim-gold') as HTMLButtonElement).addEventListener('click', () => {
        this.claim(GOLD_REWARD_ID);
      });
    } else {
      this.goldEl.innerHTML = `<span class="text-dim album-gold-hint">${STR.albumGoldReward}</span>`;
    }
  }

  private claim(rewardId: string): void {
    const data = this.save.data;
    if (data.stickerPageRewards.includes(rewardId)) return;
    if (rewardId === GOLD_REWARD_ID) {
      data.unlockedColorways.push('gold');
    } else {
      const page = ALBUM_PAGES.find((p) => p.id === rewardId);
      if (!page) return;
      if (page.reward.kind === 'cores') data.cores += page.reward.amount;
      else data.unlockedColorways.push(page.reward.colorwayId);
    }
    data.stickerPageRewards.push(rewardId);
    this.save.save();
    this.sfx.stickerFanfare();
    this.cb.onClaimed();
    this.render();
  }

  private renderDetail(): void {
    if (!this.detailId) {
      this.detailEl.innerHTML = '';
      return;
    }
    const def = STICKERS.find((s) => s.id === this.detailId);
    if (!def) return;
    const data = this.save.data;
    const unlockedAt = data.stickers[def.id];
    const info = STR.stickers[def.id];
    if (!unlockedAt && def.secret) {
      this.detailEl.innerHTML = `
        <span class="album-detail-icon">❓</span>
        <span class="album-detail-name">${STR.albumSecretName}</span>
        <span class="album-detail-desc">${info?.hint ?? ''}</span>
      `;
      return;
    }
    const since = unlockedAt
      ? `<span class="album-detail-date">${STR.albumSince(new Date(unlockedAt).toLocaleDateString('de-DE'))}</span>`
      : '';
    this.detailEl.innerHTML = `
      <span class="album-detail-icon">${def.icon}</span>
      <span class="album-detail-name" style="color: var(--rarity-${def.rarity})">${info?.name ?? def.id}</span>
      <span class="album-detail-desc">${info?.desc ?? ''}</span>
      ${since}
    `;
  }

  /** Beim Verlassen: NEU-Badges gelten genau fuer einen Besuch. */
  commitSeen(): void {
    this.save.data.lastAlbumSeen = new Date().toISOString();
    this.save.save();
  }

  private isNew(id: string): boolean {
    const at = this.save.data.stickers[id];
    if (!at) return false;
    const seen = this.save.data.lastAlbumSeen;
    return seen === '' || at > seen;
  }

  /** Fuer den Menue-Button: gibt es Sticker seit dem letzten Album-Besuch? */
  static hasNews(save: SaveManager): boolean {
    const seen = save.data.lastAlbumSeen;
    return Object.values(save.data.stickers).some((at) => seen === '' || at > seen);
  }
}
