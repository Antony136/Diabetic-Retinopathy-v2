// Report List Component
// Place this in src/components/ReportList.tsx

import { useState, useEffect } from 'react';
import { type Report, reportService } from '../services/reportService';

interface ReportListProps {
  patientId: number;
  onSelectReport: (report: Report) => void;
  refreshTrigger?: number;
}

export function ReportList({ patientId, onSelectReport, refreshTrigger }: ReportListProps) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReports();
  }, [patientId, refreshTrigger]);

  const loadReports = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportService.getPatientReports(patientId);
      setReports(data);
    } catch (err) {
      setError('Failed to load reports');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (reportId: number) => {
    if (!window.confirm('Are you sure you want to delete this report?')) {
      return;
    }

    try {
      await reportService.deleteReport(reportId);
      setReports(reports.filter((r) => r.id !== reportId));
    } catch (err) {
      setError('Failed to delete report');
    }
  };

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading reports...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        {error}
        <button onClick={loadReports} style={{ marginLeft: '10px' }}>
          Retry
        </button>
      </div>
    );
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
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
                transition: 'transform 0.2s ease',
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

                <button
                  onClick={() => onSelectReport(report)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    marginBottom: '5px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  View Details
                </button>

                <button
                  onClick={() => handleDelete(report.id)}
                  style={{
                    width: '100%',
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
          ))}
        </div>
      )}
    </div>
  );
}
