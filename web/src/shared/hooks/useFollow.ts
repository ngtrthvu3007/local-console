import { useNavigate } from "react-router";

interface FollowEvent {
  preventDefault(): void;
  detail: { href?: string; external?: boolean };
}

// Chuyển onFollow của Cloudscape sang react-router (không tải lại trang).
// Truyền `href` khi event không có, vd: identity của TopNavigation.
export function useFollow() {
  const navigate = useNavigate();
  return (event: FollowEvent, href = event.detail.href) => {
    if (event.detail.external || !href) return;
    event.preventDefault();
    navigate(href);
  };
}
