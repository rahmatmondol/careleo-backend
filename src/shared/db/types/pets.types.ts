export interface PetRow {
  id: string;
  userId: string;
  name: string;
  type: string;
  breed?: string | null;
  gender?: string | null;
  dob?: string | null;
  weight?: number | null;
  color?: string | null;
  photoUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePetInput {
  userId: string;
  name: string;
  type: string;
  breed?: string;
  gender?: string;
}

export interface UpdatePetInput extends Partial<CreatePetInput> {}
