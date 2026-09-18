/**
 * The small, promise-based Chrome API surface used by this extension.
 * Keeping this boundary explicit avoids a runtime dependency and accidental use
 * of APIs that need additional permissions. Chrome 120 is the supported floor.
 */
interface BrowserEvent<Listener> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
}
declare namespace chrome {
  namespace runtime {
    const id: string;
    interface MessageSender {
      id?: string;
      url?: string;
      origin?: string;
      tab?: tabs.Tab;
      frameId?: number;
      documentId?: string;
    }
    function getURL(path: string): string;
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    function openOptionsPage(): Promise<void>;
    const onMessage: BrowserEvent<(message: unknown, sender: MessageSender, sendResponse: (response: unknown) => void) => boolean | void>;
    const onInstalled: BrowserEvent<(details: {
      reason: string;
    }) => void>;
    const onStartup: BrowserEvent<() => void>;
  }
  namespace tabs {
    interface Tab {
      id?: number;
      windowId: number;
      active: boolean;
      url?: string;
      pendingUrl?: string;
      title?: string;
      status?: string;
      incognito?: boolean;
      splitViewId?: number;
    }
    function query(query: {
      active?: boolean;
      currentWindow?: boolean;
      windowId?: number;
      lastFocusedWindow?: boolean;
    }): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
    function create(options: {
      url: string;
      active?: boolean;
    }): Promise<Tab>;
    function update(tabId: number, options: {
      active?: boolean;
      url?: string;
    }): Promise<Tab>;
    function captureVisibleTab(windowId: number, options: {
      format: 'png';
    }): Promise<string>;
    function sendMessage<T = unknown>(tabId: number, message: unknown, options?: {
      frameId?: number;
      documentId?: string;
    }): Promise<T>;
    const onActivated: BrowserEvent<(info: {
      tabId: number;
      windowId: number;
    }) => void>;
    const onUpdated: BrowserEvent<(tabId: number, change: {
      status?: string;
      url?: string;
    }, tab: Tab) => void>;
    const onRemoved: BrowserEvent<(tabId: number) => void>;
  }
  namespace windows {
    const WINDOW_ID_NONE: number;
    function get(windowId: number): Promise<{
      id?: number;
      focused: boolean;
    }>;
    const onFocusChanged: BrowserEvent<(windowId: number) => void>;
  }
  namespace scripting {
    function executeScript(options: {
      target: {
        tabId: number;
        allFrames?: boolean;
      };
      files: string[];
    }): Promise<{
      frameId: number;
      documentId?: string;
    }[]>;
  }
  namespace permissions {
    interface Permissions {
      origins?: string[];
      permissions?: string[];
    }
    function contains(permissions: Permissions): Promise<boolean>;
    function request(permissions: Permissions): Promise<boolean>;
    const onAdded: BrowserEvent<(permissions: Permissions) => void>;
    const onRemoved: BrowserEvent<(permissions: Permissions) => void>;
  }
  namespace storage {
    interface Area {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      set(values: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
    }
    const session: Area;
    const local: Area;
    const onChanged: BrowserEvent<(changes: Record<string, {
      oldValue?: unknown;
      newValue?: unknown;
    }>, areaName: string) => void>;
  }
  namespace action {
    function setBadgeText(options: {
      text: string;
      tabId?: number;
    }): Promise<void>;
    function setBadgeBackgroundColor(options: {
      color: string;
      tabId?: number;
    }): Promise<void>;
  }
  namespace commands {
    const onCommand: BrowserEvent<(command: string, tab?: tabs.Tab) => void>;
  }
}
