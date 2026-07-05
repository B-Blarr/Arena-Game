/**
 * DEV-only Gamepad-Mock (?padmock): monkeypatcht navigator.getGamepads,
 * damit Browser-Tests ohne echte Hardware laufen. Funktioniert, WEIL die
 * PadRegistry Verbindungen per Poll-Diff erkennt (gamepadconnected-Events
 * sind nicht synthetisierbar — Gamepad ist nicht konstruierbar).
 *
 * window.__padMock: connect/disconnect/setStick/press/release/tap/rumbleLog
 */

interface MockButton {
  pressed: boolean;
  touched: boolean;
  value: number;
}

interface MockPad {
  index: number;
  id: string;
  connected: boolean;
  mapping: string;
  axes: number[];
  buttons: MockButton[];
  timestamp: number;
  vibrationActuator: {
    playEffect: (type: string, params: unknown) => Promise<string>;
  };
}

export interface PadMockApi {
  connect: (index: number) => void;
  disconnect: (index: number) => void;
  setStick: (index: number, side: 'left' | 'right', x: number, y: number) => void;
  press: (index: number, btn: number) => void;
  release: (index: number, btn: number) => void;
  /** Kurzer Druck: press jetzt, release nach 60 ms. */
  tap: (index: number, btn: number) => void;
  rumbleLog: Array<{ index: number; params: unknown }>;
}

export function installPadMock(): void {
  const slots: Array<MockPad | null> = [null, null, null, null];
  const rumbleLog: PadMockApi['rumbleLog'] = [];

  const makePad = (index: number): MockPad => ({
    index,
    id: `MockPad ${index} (STANDARD GAMEPAD)`,
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0,
    vibrationActuator: {
      playEffect: (_type, params) => {
        rumbleLog.push({ index, params });
        return Promise.resolve('complete');
      },
    },
  });

  navigator.getGamepads = () => slots as unknown as (Gamepad | null)[];

  const api: PadMockApi = {
    connect: (i) => {
      slots[i] = slots[i] ?? makePad(i);
      (slots[i] as MockPad).connected = true;
    },
    disconnect: (i) => {
      if (slots[i]) (slots[i] as MockPad).connected = false;
    },
    setStick: (i, side, x, y) => {
      const p = slots[i];
      if (!p) return;
      const base = side === 'left' ? 0 : 2;
      p.axes[base] = x;
      p.axes[base + 1] = y;
    },
    press: (i, btn) => {
      const b = slots[i]?.buttons[btn];
      if (b) {
        b.pressed = true;
        b.value = 1;
      }
    },
    release: (i, btn) => {
      const b = slots[i]?.buttons[btn];
      if (b) {
        b.pressed = false;
        b.value = 0;
      }
    },
    tap: (i, btn) => {
      api.press(i, btn);
      window.setTimeout(() => api.release(i, btn), 60);
    },
    rumbleLog,
  };

  (window as unknown as Record<string, unknown>).__padMock = api;
  console.info('Neon Arena: Pad-Mock aktiv (window.__padMock).');
}
