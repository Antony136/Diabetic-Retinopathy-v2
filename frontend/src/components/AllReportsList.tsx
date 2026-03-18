import { useState, useEffect } from 'react'
import { type Report, reportService } from '../services/reportService'
import { ReportDetail } from './ReportDetail'

interface AllReportsListProps {
  refreshTrigger?: boolean
}

export function AllReportsList({ refreshTrigger }: AllReportsListProps) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedReport, setSelectedReport] = useState<Report | null>(null)

  useEffect(() => {
    loadReports()
  }, [refreshTrigger])

  const loadReports = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await reportService.getAllReports()
      setReports(data)
    } catch (err) {
      setError('Failed to load reports')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (reportId: number) => {
    if (!window.confirm('Are you sure you want to delete this report?')) {
      return
    }

    try {
      await reportService.deleteReport(reportId)
      setReports(reports.filter((r) => r.id !== reportId))
      if (selectedReport?.id === reportId) {
        setSelectedReport(null)
      }
    } catch (err) {
      setError('Failed to delete report')
    }
  }

  if (selectedReport) {
    return (
      <div>
        <button
          onClick={() => setSelectedReport(null)}
          style={{
            marginBottom: '15px',
            padding: '8px 15px',
            background: '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            cursor: 'pointer',
          }}
        >
          ← Back to Reports
        </button>
        <ReportDetail report={selectedReport} onClose={() => {
          handleDelete(selectedReport.id)
          setSelectedReport(null)
        }} />
      </div>
    )
  }

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading reports...</div>
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        {error}
        <button onClick={loadReports} style={{ marginLeft: '10px' }}>
          Retry
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px' }}>
      <h3>Reports ({reports.length})</h3>

      {reports.length === 0 ? (
        <p style={{ color: '#666' }}>No reports yet</p>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '15px',
          }}
        >
          {reports.map((report) => (
            <div
              key={report.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: '8px',
                overflow: 'hidden',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-5px)'
                e.currentTarget.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
                e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'
              }}
            >
              <div
                style={{
                  background: '#f5f5f5',
                  padding: '10px',
                  borderBottom: '1px solid #ddd',
                }}
              >
                <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: '14px' }}>
                  Report #{report.id}
                </p>
                <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                  {new Date(report.created_at).toLocaleDateString()}
                </p>
              </div>

              <div style={{ padding: '10px' }}>
                <div
                  style={{
                    marginBottom: '10px',
                    padding: '8px',
                    background: '#f0f7ff',
                    borderRadius: '4px',
                    borderLeft: `3px solid ${
                      report.confidence > 0.8 ? '#dc3545' : '#ffc107'
                    }`,
                  }}
                >
                  <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', fontSize: '14px' }}>
                    {report.prediction}
                  </p>
                  <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                    Confidence: {(report.confidence * 100).toFixed(1)}%
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setSelectedReport(report)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: '#667eea',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(report.id)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      background: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
