const API_URL = 'http://localhost:8000/api/reports'

export interface Report {
  id: number;
  patient_id: number;
  image_url: string;
  heatmap_url: string;
  prediction: string;
  confidence: number;
  created_at: string;
}

export const reportService = {
  // Get authorization header
  getAuthHeader() {
    const token = localStorage.getItem('access_token');
    if (!token) {
      throw new Error('No token found');
    }
    return {
      'Authorization': `Bearer ${token}`,
    };
  },

  // Upload image and create report
  async createReport(patientId: number, file: File): Promise<Report> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/?patient_id=${patientId}`, {
      method: 'POST',
      headers: this.getAuthHeader(),
      body: formData,
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type');
      let errorMsg = 'Failed to create report';
      
      try {
        if (contentType?.includes('application/json')) {
          const error = await response.json();
          errorMsg = error.detail || error.message || errorMsg;
        } else {
          errorMsg = await response.text();
        }
      } catch {
        errorMsg = `Error: ${response.status} ${response.statusText}`;
      }
      
      throw new Error(errorMsg);
    }

    return response.json();
  },

  // Get all reports for current doctor
  async getAllReports(): Promise<Report[]> {
    const response = await fetch(API_URL + '/', {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch reports');
    }

    return response.json();
  },

  // Get single report
  async getReport(reportId: number): Promise<Report> {
    const response = await fetch(`${API_URL}/${reportId}`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch report');
    }

    return response.json();
  },

  // Get all reports for a patient
  async getPatientReports(patientId: number): Promise<Report[]> {
    const response = await fetch(`${API_URL}/patient/${patientId}`, {
      method: 'GET',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch patient reports');
    }

    return response.json();
  },

  // Delete report
  async deleteReport(reportId: number): Promise<void> {
    const response = await fetch(`${API_URL}/${reportId}`, {
      method: 'DELETE',
      headers: this.getAuthHeader(),
    });

    if (!response.ok) {
      throw new Error('Failed to delete report');
    }
  },
};
