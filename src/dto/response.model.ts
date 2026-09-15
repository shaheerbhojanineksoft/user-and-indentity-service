/** Shared response wrapper — shape used across the whole flow. */
export class ResponseModel<T = any> {
  isSuccess: boolean;
  data: T | null;
  message: string;

  constructor(isSuccess = false, data: T | null = null, message = "") {
    this.isSuccess = isSuccess;
    this.data = data;
    this.message = message;
  }
}

export function success<T>(data: T, message = ""): ResponseModel<T> {
  return new ResponseModel<T>(true, data, message);
}

export function failure(message: string): ResponseModel<null> {
  return new ResponseModel<null>(false, null, message);
}
