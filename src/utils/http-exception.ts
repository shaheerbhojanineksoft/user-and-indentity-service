/**
 * Minimal stand-in for Nest's `HttpException` — the source auth microservice
 * throws `new HttpException('Invalid user or password!', 422)`.
 *
 * The status is carried for parity/debugging ONLY: the federated-auth
 * controller still maps EVERY thrown error to HTTP `500`, because that is
 * exactly what the original gateway did (the TCP error status never reached
 * Keycloak). Keeping the status here means the port stays traceable to the
 * source while the observable behaviour is unchanged.
 */
export class HttpException extends Error {
  readonly status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.name = "HttpException";
    this.status = status;
  }
}
