interface InboxItem {
  Region: string;
  Timestamp: string;
}

// Timestamp có tới 9 chữ số lẻ, nên so bằng số chứ không so chuỗi
export const sentAt = (item: Pick<InboxItem, "Timestamp">) => Date.parse(item.Timestamp);

// Hộp thư của Floci (SMS, mail) dùng chung mọi region và trả tin cũ nhất trước
export const newestInRegion = <T extends InboxItem>(items: T[], region: string) =>
  items
    .filter((item) => item.Region === region)
    .sort((first, second) => sentAt(second) - sentAt(first));
