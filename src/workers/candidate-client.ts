/** Candidate inference contract independent of a model CLI or HTTP protocol. */
export interface CandidateInferenceInput {
  session_id:string; prompt:string; model:{providerID:string;modelID:string};
  timeout_ms:number; max_output_bytes:number; signal:AbortSignal;
}
export interface CandidateInferenceResult {
  value:unknown; text:string; message_id:string|null;
  usage:{input_tokens:number|null;output_tokens:number|null};
}
export interface CandidateInferenceClient {
  createSession():Promise<{session_id:string}>;
  generate(input:CandidateInferenceInput):Promise<CandidateInferenceResult>;
  abortSession(sessionId:string):Promise<void>;
}
