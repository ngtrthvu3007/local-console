// localStorage có thể bị chặn (chế độ riêng tư, chặn dữ liệu trang): đọc được
// null, ghi không được thì bỏ qua. Dữ liệu ở đây chỉ để tiện, mất không sao
export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Không lưu được thì chỉ có hiệu lực cho lần mở này
  }
}
