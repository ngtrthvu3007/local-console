import type { Image } from "@aws-sdk/client-ec2";

// AMI mà Floci chạy không như tên gọi hoặc có thể không khởi động được (đã đo ở khảo sát 2026-11-19;
// arm64 trên máy Intel chưa thử nên chỉ nói "may")
const AMI_WARNINGS: { applies: (image: Image) => boolean; message: string }[] = [
  {
    applies: (image) => image.Architecture === "arm64",
    message:
      "An arm64 image may fail to start on an Intel machine. The instance then ends up Terminated, with no reason.",
  },
  {
    applies: (image) => /windows/i.test(`${image.Name} ${image.Description}`),
    message: "Floci doesn't run Windows: it starts this AMI as Amazon Linux 2023.",
  },
  {
    applies: (image) => /alpine/i.test(`${image.Name} ${image.Description}`),
    message:
      "Floci often can't pull the Alpine image (registry rate limit). The instance then ends up Terminated, with no reason.",
  },
];

export const amiWarning = (image?: Image) =>
  image && AMI_WARNINGS.find(({ applies }) => applies(image))?.message;
