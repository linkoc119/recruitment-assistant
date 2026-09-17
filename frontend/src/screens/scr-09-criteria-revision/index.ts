import type { ScreenModule } from "../../router/types.js";

export async function mount(container: HTMLElement): Promise<void> {
  container.innerHTML = "<h1>SCR-09 — Lịch sử chỉnh sửa tiêu chí</h1>";
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
