export interface RouteParams {
  [key: string]: string;
}

export interface ScreenModule {
  mount(container: HTMLElement, params: RouteParams): void | Promise<void>;
  unmount(): void;
}

export interface RouteDefinition {
  pattern: RegExp;
  paramNames: string[];
  load: () => Promise<ScreenModule>;
}
