type StorageArea = "localStorage" | "sessionStorage";

// Storage có thể bị chặn (chế độ riêng tư, chặn dữ liệu trang), kể cả khi chỉ chạm vào window[area]:
// đọc được null, ghi không được thì bỏ qua. Dữ liệu ở đây chỉ để tiện, mất không sao
export function readStorage(key: string, area: StorageArea = "localStorage"): string | null {
  try {
    return window[area].getItem(key);
  } catch {
    return null;
  }
}

// value rỗng: xóa key
export function writeStorage(key: string, value: string, area: StorageArea = "localStorage") {
  try {
    if (value) window[area].setItem(key, value);
    else window[area].removeItem(key);
  } catch {
    // Không lưu được thì chỉ có hiệu lực cho lần mở này
  }
}
