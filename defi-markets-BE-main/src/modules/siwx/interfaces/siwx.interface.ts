export interface SIWXMessage {
  domain: string;
  address: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
}



export interface SIWXSession {
  id: string;
  address: string;
  chainId: string;
  message: SIWXMessage;
  signature: string;
  issuedAt: string;
  expiresAt: string;
  isValid: boolean;
}

// Public-safe versions for API responses
export type PublicSIWXMessage = Omit<SIWXMessage, 'nonce'>;
export type PublicSIWXSession = Omit<SIWXSession, 'signature' | 'message'> & {
  message: PublicSIWXMessage;
  token: string;
};

export interface SIWXVerificationRequest {
  message: SIWXMessage;
  signature: string;
  chainId: string;
}

export interface SIWXVerificationResponse {
  isValid: boolean;
  session?: PublicSIWXSession;
  error?: string;
}

export interface SIWXSessionResponse {
  sessions: SIWXSession[];
}

export interface SIWXRevokeResponse {
  success: boolean;
  message: string;
}

export type CaipNetworkId = string;
