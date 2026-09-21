/**
 * Điều phối "lưu nội dung editor" với các chỉnh sửa tiếp tục xảy ra trong lúc
 * request đang bay. Hai bất biến:
 *   - payload là snapshot chụp trước khi gửi, và baseline được server xác nhận
 *     chính là snapshot đó — không bao giờ là nội dung editor lúc response về;
 *   - dirty chỉ được xóa khi editor vẫn bằng đúng snapshot đã gửi.
 */
export interface DraftSyncPort<S, R> {
  /** Nội dung editor hiện tại. Gọi đồng bộ tại thời điểm gửi. */
  read(): S;
  /** Gửi một snapshot lên server. */
  send(payload: S): Promise<R>;
  /** Báo trạng thái dirty ra ngoài (SCR-03 nối vào `v.dirty`). */
  onDirty(dirty: boolean): void;
  /** Mặc định structuredClone. */
  snapshot?(value: S): S;
  /** Mặc định JSON.stringify. */
  serialize?(value: S): string;
}

export interface DraftSync<R> {
  /** Đặt baseline server đang giữ; null = server chưa giữ gì (chưa có draft). */
  setBaseline(value: unknown | null): void;
  /** true khi read() khác baseline. */
  isDirty(): boolean;
  /**
   * Lưu, trừ khi editor đã bằng baseline. Các lời gọi đồng thời được xếp hàng:
   * lời gọi sau chờ lời gọi trước xong rồi mới đánh giá lại.
   * Resolve `null` khi không cần gửi.
   */
  save(): Promise<R | null>;
}

export function createDraftSync<S, R>(port: DraftSyncPort<S, R>): DraftSync<R> {
  const snapshot = port.snapshot ?? ((v: S) => structuredClone(v));
  const serialize = port.serialize ?? ((v: S) => JSON.stringify(v));
  let baseline: string | null = null;
  let chain: Promise<unknown> = Promise.resolve();

  const isDirty = () => baseline === null || baseline !== serialize(port.read());

  const run = async (): Promise<R | null> => {
    const payload = snapshot(port.read());
    const serialized = serialize(payload);
    if (baseline === serialized) return null;
    const result = await port.send(payload);
    baseline = serialized;
    port.onDirty(serialize(port.read()) !== baseline);
    return result;
  };

  return {
    setBaseline(value) { baseline = value === null ? null : serialize(value as S); },
    isDirty,
    save() {
      // `then(run, run)`: một lần lưu thất bại không được chặn lần lưu sau.
      const next = chain.then(run, run);
      chain = next.catch(() => {});
      return next;
    },
  };
}
