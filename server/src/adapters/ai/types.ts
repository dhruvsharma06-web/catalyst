import { z } from "zod";

export const scannedMedicationSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dosage: z.string().trim().max(60),
  instructions: z.string().trim().max(300),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7),
});

export const scanOutputSchema = z.object({
  medications: z.array(scannedMedicationSchema).max(20),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(600),
});

export const summaryOutputSchema = z.object({
  summary: z.string().min(1).max(1200),
  highlights: z.array(z.string().max(200)).max(6),
  attention: z.array(z.string().max(200)).max(6),
});

export type ScanOutput = z.infer<typeof scanOutputSchema>;
export type SummaryOutput = z.infer<typeof summaryOutputSchema>;

/** Facts the care summary is written from. Only aggregate, non-identifying data is sent to the model. */
export interface CareFacts {
  elderFirstName: string;
  periodDays: number;
  adherenceRate: number | null;
  streakDays: number;
  missedDoses: Array<{ medication: string; date: string; time: string }>;
  perMedication: Array<{ name: string; rate: number | null }>;
  upcomingAppointments: Array<{ doctor: string; specialty: string; startsLocal: string }>;
  lowStock: Array<{ name: string; left: number }>;
}

export class AiUnavailableError extends Error {
  constructor(message = "The AI service is unavailable right now.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export interface AiClient {
  readonly modelVersion: string;
  scanPrescription(imageBase64: string, mimeType: string): Promise<ScanOutput>;
  summarizeCare(facts: CareFacts): Promise<SummaryOutput>;
}
