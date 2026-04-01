import type {
  ChangeIntakeStatusInput,
  CreateLfkIntakeInput,
  CreateNutritionIntakeInput,
  IntakeRequest,
  IntakeRequestFull,
  IntakeStatus,
  IntakeType,
} from "./types";

export type ListIntakeQuery = {
  userId?: string;
  type?: IntakeType;
  status?: IntakeStatus;
  limit?: number;
  offset?: number;
};

export type OnlineIntakePort = {
  createLfkRequest(input: CreateLfkIntakeInput): Promise<IntakeRequest>;
  createNutritionRequest(input: CreateNutritionIntakeInput): Promise<IntakeRequest>;
  getById(id: string): Promise<IntakeRequestFull | null>;
  listRequests(query: ListIntakeQuery): Promise<{ items: IntakeRequest[]; total: number }>;
  countActiveByUser(userId: string, type: IntakeType): Promise<number>;
  changeStatus(input: ChangeIntakeStatusInput): Promise<IntakeRequest>;
};

export type IntakeNotificationPort = {
  notifyNewIntakeRequest(input: {
    requestId: string;
    type: IntakeType;
    patientName: string;
    patientPhone: string;
    summary: string;
  }): Promise<void>;
};

export type OnlineIntakeService = {
  submitLfk(input: CreateLfkIntakeInput & { patientName: string; patientPhone: string }): Promise<IntakeRequest>;
  submitNutrition(
    input: CreateNutritionIntakeInput & { patientName: string; patientPhone: string },
  ): Promise<IntakeRequest>;
  listMyRequests(query: ListIntakeQuery & { userId: string }): Promise<{ items: IntakeRequest[]; total: number }>;
  getRequestForDoctor(id: string): Promise<IntakeRequestFull | null>;
  listForDoctor(query: ListIntakeQuery): Promise<{ items: IntakeRequest[]; total: number }>;
  changeStatus(input: ChangeIntakeStatusInput): Promise<IntakeRequest>;
};
