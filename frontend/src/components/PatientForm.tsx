import { useState } from 'react'
import { type Patient, type PatientCreate, patientService } from '../services/patientService'

interface PatientFormProps {
  patient?: Patient;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function PatientForm({ patient, onSuccess, onCancel }: PatientFormProps) {
  const [formData, setFormData] = useState<PatientCreate>(
    patient ? {
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      phone: patient.phone,
      address: patient.address,
    } : {
      name: '',
      age: 0,
      gender: 'Male',
      phone: '',
      address: '',
    }
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name === 'age' ? parseInt(value) : value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (patient) {
        await patientService.updatePatient(patient.id, formData);
      } else {
        await patientService.createPatient(formData);
      }
      onSuccess();
    } catch (err) {
      setError(patient ? 'Failed to update patient' : 'Failed to create patient');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '500px' }}>
      <h2>{patient ? 'Edit Patient' : 'Add New Patient'}</h2>
      {error && (
        <div style={{
          color: '#dc3545',
          background: '#f8d7da',
          padding: '10px',
          borderRadius: '5px',
          marginBottom: '20px',
        }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Name *
          </label>
          <input
            type="text"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Age *
          </label>
          <input
            type="number"
            name="age"
            value={formData.age}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Gender *
          </label>
          <select
            name="gender"
            value={formData.gender}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              boxSizing: 'border-box',
            }}
          >
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Phone *
          </label>
          <input
            type="tel"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            required
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
            Address
          </label>
          <input
            type="text"
            name="address"
            value={formData.address}
            onChange={handleChange}
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '5px',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '10px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Saving...' : (patient ? 'Update Patient' : 'Create Patient')}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                flex: 1,
                padding: '10px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
