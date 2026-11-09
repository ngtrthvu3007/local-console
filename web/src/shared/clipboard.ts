import { notifyError, notifySuccess } from "./hooks/useNotify.ts";

export const copyToClipboard = (text: string, label: string) =>
  navigator.clipboard
    .writeText(text)
    .then(() => notifySuccess(`Copied ${label}`))
    .catch((error) => notifyError(error, `Couldn't copy ${label}`));
