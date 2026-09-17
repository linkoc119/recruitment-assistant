import type { ScreenModule } from "../../router/types.js";

export async function mount(container: HTMLElement): Promise<void> {
  container.innerHTML = "<h1>SCR-08 — Lịch sử lượt sàng lọc</h1>";
}

export function unmount(): void {}

export default { mount, unmount } satisfies ScreenModule;
