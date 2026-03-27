import axios from "axios";

interface ErrorPayload {
  msg?: string;
  message?: string;
}

export const extractBatchFailures = (data: any): any[] => {
  if (!data) return [];

  return data.failures || [];
};

export const buildBatchFailureMessage = (
  result: any,
  summary: string,
): string => {
  const failCount = result.failCount || 0;

  return `${summary} (失败: ${failCount})`;
};

export const isUnauthorizedError = (error: unknown): boolean => {
  return axios.isAxiosError(error) && error.response?.status === 401;
};

export const extractApiErrorMessage = (
  error: unknown,
  fallback = "网络请求失败",
): string => {
  if (axios.isAxiosError(error)) {
    const payload = error.response?.data as ErrorPayload | undefined;

    return payload?.msg || payload?.message || error.message || fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};
