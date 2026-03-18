const API_URL = 'http://localhost:8000/api/patients'

export interface Patient {
  id: number;
  name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
  created_at: string;
  doctor_id: number;
}

export interface PatientCreate {
  name: string;
  age: number;
  gender: string;
  phone: string;
  address: string;
}

export const patientService = {
  // Get authorization header with token
  getAuthHeader() {
    const token = localStorage.getItem('access_token');
    if (!token) {
      throw new Error('No token found');
    }
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  },

  // Create new patient
  async createPatient(data: PatientCreate): Promise<Patient> {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: this.getAuthHeader(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to create patient');
    }

    return response.json();
  },

  // Get all patients for current doctor
  async getAllPatients(): Promise<Patient[]> {
    const response = await fetch(API_URL, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch patients');
    }

    return response.json();
  },

  // Get single patient by ID
  async getPatient(patientId: number): Promise<Patient> {
    const response = await fetch(`${API_URL}/${patientId}`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch patient');
    }

    return response.json();
  },

  // Update patient information
  async updatePatient(patientId: number, data: PatientCreate): Promise<Patient> {
    const response = await fetch(`${API_URL}/${patientId}`, {
      method: 'PUT',
      headers: this.getAuthHeader(),
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error('Failed to update patient');
    }

    return response.json();
  },

  // Delete patient
  async deletePatient(patientId: number): Promise<void> {
    const response = await fetch(`${API_URL}/${patientId}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete patient');
    }
  },
};
