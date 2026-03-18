import { useState, useEffect } from 'react'
import { ReportUpload } from './ReportUpload'
import { type Patient, patientService } from '../services/patientService'

interface ReportUploadSectionProps {
  onSuccess: () => void
}

export function ReportUploadSection({ onSuccess }: ReportUploadSectionProps) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPatients()
  }, [])

  const loadPatients = async () => {
    try {
      const data = await patientService.getAllPatients()
      setPatients(data)
    } catch (error) {
      console.error('Failed to load patients:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Loading patients...</div>
  }

  if (patients.length === 0) {
    return (
      <div
        style={{
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '5px',
          padding: '15px',
        }}
      >
        <p>
          No patients found. Please{' '}
          <strong>add a patient first</strong> before uploading reports.
        </p>
      </div>
    )
  }

  if (!selectedPatientId) {
    return (
      <div style={{ padding: '20px', maxWidth: '600px' }}>
        <h3>Select Patient for Report</h3>
        <select
          value=""
          onChange={(e) => setSelectedPatientId(Number(e.target.value))}
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '5px',
            marginBottom: '20px',
          }}
        >
          <option value="">-- Choose a patient --</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.name} (Age: {patient.age}, Gender: {patient.gender})
            </option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div>
      <div
        style={{
          background: '#e7f3ff',
          border: '1px solid #667eea',
          borderRadius: '5px',
          padding: '10px',
          marginBottom: '15px',
        }}
      >
        <strong>Selected Patient:</strong>{' '}
        {patients.find((p) => p.id === selectedPatientId)?.name}
        <button
          onClick={() => setSelectedPatientId(null)}
          style={{
            marginLeft: '10px',
            padding: '5px 10px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer',
          }}
        >
          Change
        </button>
      </div>
      <ReportUpload
        patientId={selectedPatientId}
        onSuccess={() => {
          setSelectedPatientId(null)
          onSuccess()
        }}
        onCancel={() => setSelectedPatientId(null)}
      />
    </div>
  )
}
