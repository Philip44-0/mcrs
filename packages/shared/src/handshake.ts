/** A module as the client and the server describe it for the handshake. */
export interface ModuleVersion {
  id: string;
  version: string;
}

/** What the client sends to POST /api/_core/handshake: the modules its build contains. */
export interface HandshakeRequest {
  /** Major version of the skeleton API the client was built for, for example "1". */
  clientApi: string;
  modules: ModuleVersion[];
}

export interface ModuleDiff {
  /** The server has the module (with a client part), the client does not. "id@version" of the server's. */
  missingOnClient: string[];
  /** The client has the module, but the server does not have it as a client module. "id@version" of the client's. */
  missingOnServer: string[];
  versionMismatch: Array<{ id: string; server: string; client: string }>;
}

export interface HandshakeResponse {
  /** True when the client was built from the same client modules as the server has. */
  compatible: boolean;
  /** What the client should do about a mismatch: "block" stops the app, "warn" lets it go on. */
  policy: 'block' | 'warn';
  api: { server: string; client: string };
  /** Full fingerprints (64 hex characters). Show the first 12. */
  server: { fingerprint: string; clientFingerprint: string };
  /** The server computes this from the list the client sent. */
  client: { clientFingerprint: string };
  diff: ModuleDiff;
}
