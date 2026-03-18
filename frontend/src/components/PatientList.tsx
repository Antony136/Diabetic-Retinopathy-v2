import { useState, useEffect } from 'react'
import { type Patient, patientService } from '../services/patientService'

interface PatientListProps {
  onSelectPatient?: (patient: Patient) => void;
  onCreateNew?: () => void;
}

export function PatientList({ onSelectPatient, onCreateNew }: PatientListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadPatients();
  }, []);

  const loadPatients = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await patientService.getAllPatients();
      setPatients(data);
    } catch (err) {
      setError('Failed to load patients');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (patientId: number) => {
    if (!window.confirm('Are you sure you want to delete this patient?')) {
      return;
    }

    try {
      await patientService.deletePatient(patientId);
      setPatients(patients.filter(p => p.id !== patientId));
    } catch (err) {
      setError('Failed to delete patient');
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading patients...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        {error}
        <button onClick={loadPatients} style={{ marginLeft: '10px' }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <button
          onClick={onCreateNew}
          style={{
            padding: '10px 20px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          + Add New Patient
        </button>
      </div>

      {patients.length === 0 ? (
        <p>No patients found. Create one to get started!</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f5f5f5' }}>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  Name
                </th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  Age
                </th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  Gender
                </th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  Phone
                </th>
                <th style={{ padding: '10px', textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {patients.map((patient) => (
                <tr key={patient.id} style={{ borderBottom: '1px solid #ddd' }}>
                  <td style={{ padding: '10px' }}>{patient.name}</td>
                  <td style={{ padding: '10px' }}>{patient.age}</td>
                  <td style={{ padding: '10px' }}>{patient.gender}</td>
                  <td style={{ padding: '10px' }}>{patient.phone}</td>
                  <td style={{ padding: '10px' }}>
                    <button
                      onClick={() => onSelectPatient(patient)}
                      style={{
                        padding: '5px 10px',
                        marginRight: '5px',
                        background: '#667eea',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(patient.id)}
                      style={{
                        padding: '5px 10px',
                        background: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
