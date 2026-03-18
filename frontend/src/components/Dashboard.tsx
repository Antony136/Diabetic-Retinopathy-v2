import { useState, useEffect } from 'react'
import { authService } from '../services/authService'
import { PatientList } from './PatientList'
import { PatientForm } from './PatientForm'
import { ReportUploadSection } from './ReportUploadSection'
import { AllReportsList } from './AllReportsList'
import '../styles/Dashboard.css'

type Page = 'patients' | 'addPatient' | 'reports'

interface User {
  id: number
  name: string
  email: string
}

export function Dashboard() {
  const [currentPage, setCurrentPage] = useState<Page>('patients')
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshPatients, setRefreshPatients] = useState(false)
  const [refreshReports, setRefreshReports] = useState(false)

  useEffect(() => {
    loadUser()
  }, [])

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser()
      setUser(currentUser)
    } catch (error) {
      console.error('Failed to load user:', error)
      authService.logout()
      window.location.reload()
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    authService.logout()
    window.location.reload()
  }

  const [editingPatient, setEditingPatient] = useState<any>(null)

  const handlePatientCreated = () => {
    setRefreshPatients(!refreshPatients)
    setEditingPatient(null)
    setCurrentPage('patients')
  }

  const handleEditPatient = (patient: any) => {
    setEditingPatient(patient)
    setCurrentPage('addPatient')
  }

  const handleReportCreated = () => {
    setRefreshReports(!refreshReports)
    setCurrentPage('reports')
  }

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>
  }

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1>Diabetic Retinopathy Detection</h1>
          <p className="subtitle">AI-Powered Analysis System</p>
        </div>
        <div className="header-right">
          <div className="user-info">
            <p className="user-name">👨‍⚕️ {user?.name}</p>
            <p className="user-email">{user?.email}</p>
          </div>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="dashboard-nav">
        <div className="nav-items">
          <button
            className={`nav-item ${currentPage === 'patients' ? 'active' : ''}`}
            onClick={() => setCurrentPage('patients')}
          >
            📋 My Patients
          </button>
          <button
            className={`nav-item ${currentPage === 'addPatient' ? 'active' : ''}`}
            onClick={() => setCurrentPage('addPatient')}
          >
            ➕ Add Patient
          </button>
          <button
            className={`nav-item ${currentPage === 'reports' ? 'active' : ''}`}
            onClick={() => setCurrentPage('reports')}
          >
            🔍 Reports
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="dashboard-content">
        {currentPage === 'patients' && (
          <section className="page-section">
            <h2>My Patients</h2>
            <PatientList 
              key={refreshPatients.toString()}
              onSelectPatient={handleEditPatient}
              onCreateNew={() => setCurrentPage('addPatient')}
            />
          </section>
        )}

        {currentPage === 'addPatient' && (
          <section className="page-section">
            <h2>{editingPatient ? 'Edit Patient' : 'Add New Patient'}</h2>
            <PatientForm 
              patient={editingPatient || undefined}
              onSuccess={handlePatientCreated} 
            />
          </section>
        )}

        {currentPage === 'reports' && (
          <section className="page-section">
            <h2>Analysis Reports</h2>
            <div className="reports-container">
              <ReportUploadSection onSuccess={handleReportCreated} />
              <AllReportsList refreshTrigger={refreshReports} />
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="dashboard-footer">
        <p>© 2026 Diabetic Retinopathy Detection System | Powered by AI</p>
      </footer>
    </div>
  )
}
