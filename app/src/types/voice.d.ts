export {};

declare global {
  interface Window {
    voice?: {
      transcribe: (payload: {
        buffer: Uint8Array;
        mimeType: string;
      }) => Promise<{ text: string }>;
      enrich: (payload: {
        text: string;
        preset: string;
        language?: "de" | "en";
        includeEmojis?: boolean;
      }) => Promise<{
        output: string;
        mode?: string;
        warning?: string;
      }>;
      onToggleRecord: (handler: () => void) => void;
      setRecordingState: (payload: {
        active: boolean;
        deviceLabel?: string;
      }) => void;
      setRecordingLevel: (payload: { level: number }) => void;
    };
  }
}
