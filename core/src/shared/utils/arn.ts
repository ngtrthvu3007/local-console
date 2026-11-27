export const ARN_SEPARATOR = ":";

export const lastArnPart = (arn: string) => arn.split(ARN_SEPARATOR).pop() ?? arn;

// ARN function có thể kèm version / alias (my-function:prod) mà vẫn là cùng function
export const isArnOrQualified = (candidate: string, arn: string) =>
  candidate === arn || candidate.startsWith(`${arn}${ARN_SEPARATOR}`);
