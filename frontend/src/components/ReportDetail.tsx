import { type Report } from '../services/reportService'

interface ReportDetailProps {
  report: Report;
  onClose: () => void;
}

export function ReportDetail({ report, onClose }: ReportDetailProps) {
  const drSeverity = {
    'No DR': { color: '#28a745', label: 'Normal' },
    'Mild': { color: '#ffc107', label: 'Mild' },
    'Moderate': { color: '#fd7e14', label: 'Moderate' },
    'Severe': { color: '#dc3545', label: 'Severe' },
    'Proliferative DR': { color: '#721c24', label: 'Critical' },
  };

  const severity = drSeverity[report.prediction as keyof typeof drSeverity] || {
    color: '#6c757d',
    label: 'Unknown',
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px' }}>
      <button
        onClick={onClose}
        style={{
          marginBottom: '20px',
          padding: '8px 16px',
          background: '#6c757d',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
        }}
      >
        ← Back
      </button>

      <div
        style={{
          background: 'white',
          borderRadius: '8px',
          overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        {/* Report Header */}
        <div style={{ background: '#f5f5f5', padding: '20px', borderBottom: '1px solid #ddd' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
            <div>
              <h2 style={{ margin: '0 0 10px 0' }}>Report #{report.id}</h2>
              <p style={{ margin: '0', color: '#666' }}>
                Created: {new Date(report.created_at).toLocaleString()}
              </p>
            </div>
            <div
              style={{
                padding: '15px 20px',
                background: severity.color,
                color: 'white',
                borderRadius: '6px',
                textAlign: 'center',
              }}
            >
              <p style={{ margin: '0 0 5px 0', fontSize: '24px', fontWeight: 'bold' }}>
                {report.prediction}
              </p>
              <p style={{ margin: '0', fontSize: '12px' }}>
                Confidence: {(report.confidence * 100).toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* Images Section */}
        <div style={{ padding: '20px' }}>
          <h3 style={{ marginTop: '0' }}>Analysis Images</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Original Image */}
            <div>
              <h4 style={{ color: '#333' }}>Original Image</h4>
              <img
                src={report.image_url}
                alt="Original retina"
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  maxHeight: '400px',
                  objectFit: 'cover',
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EImage not available%3C/text%3E%3C/svg%3E';
                }}
              />
            </div>

            {/* Heatmap */}
            <div>
              <h4 style={{ color: '#333' }}>AI Heatmap</h4>
              <img
                src={report.heatmap_url}
                alt="AI heatmap"
                style={{
                  width: '100%',
                  borderRadius: '6px',
                  border: '1px solid #ddd',
                  maxHeight: '400px',
                  objectFit: 'cover',
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-family=%22Arial%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EHeatmap not available%3C/text%3E%3C/svg%3E';
                }}
              />
            </div>
          </div>
        </div>

        {/* Report Details */}
        <div
          style={{
            padding: '20px',
            borderTop: '1px solid #ddd',
            background: '#fafafa',
          }}
        >
          <h3 style={{ marginTop: '0' }}>Report Information</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '15px',
            }}
          >
            <div>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#666' }}>
                Prediction
              </p>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
                {report.prediction}
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#666' }}>
                Confidence Score
              </p>
              <p style={{ margin: '0', fontSize: '18px', fontWeight: 'bold' }}>
                {(report.confidence * 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#666' }}>
                Patient ID
              </p>
              <p style={{ margin: '0', fontSize: '16px' }}>#{report.patient_id}</p>
            </div>
            <div>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold', color: '#666' }}>
                Report ID
              </p>
              <p style={{ margin: '0', fontSize: '16px' }}>#{report.id}</p>
            </div>
          </div>
        </div>

        {/* DR Classification Guide */}
        <div
          style={{
            padding: '20px',
            borderTop: '1px solid #ddd',
            background: '#f9f9f9',
          }}
        >
          <h3 style={{ marginTop: '0' }}>DR Classification Guide</h3>
          <div style={{ fontSize: '14px', lineHeight: '1.8' }}>
            <p>
              <strong style={{ color: '#28a745' }}>No DR:</strong> Normal retina, no signs of diabetic
              retinopathy
            </p>
            <p>
              <strong style={{ color: '#ffc107' }}>Mild:</strong> Small microaneurysms visible, early
              stage
            </p>
            <p>
              <strong style={{ color: '#fd7e14' }}>Moderate:</strong> Increased hemorrhages and hard
              exudates
            </p>
            <p>
              <strong style={{ color: '#dc3545' }}>Severe:</strong> Extensive hemorrhages, many hard
              exudates, cotton wool spots
            </p>
            <p>
              <strong style={{ color: '#721c24' }}>Proliferative DR:</strong> New blood vessels,
              vitreous hemorrhage, advanced stage
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
