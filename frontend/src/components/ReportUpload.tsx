import { useState } from 'react'
import { type Report, reportService } from '../services/reportService'

interface ReportUploadProps {
  patientId: number;
  onSuccess: (report: Report) => void;
  onCancel?: () => void;
}

export function ReportUpload({ patientId, onSuccess, onCancel }: ReportUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type (only JPG and PNG are safe)
    const validTypes = ['image/jpeg', 'image/png'];
    if (!validTypes.includes(selectedFile.type)) {
      setError(`Invalid format. Supported: JPG, PNG. Got: ${selectedFile.type}`);
      return;
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError(`File too large. Max 10MB, got ${(selectedFile.size / 1024 / 1024).toFixed(1)}MB`);
      return;
    }

    setFile(selectedFile);
    setError('');

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file');
      return;
    }

    setError('');
    setLoading(true);
    setProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return 90;
          return prev + Math.random() * 30;
        });
      }, 500);

      const report = await reportService.createReport(patientId, file);
      clearInterval(progressInterval);
      setProgress(100);

      // Reset form
      setFile(null);
      setPreview('');

      setTimeout(() => {
        onSuccess(report);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '600px' }}>
      <h2>Upload Retina Image for Analysis</h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '20px' }}>
          <label
            style={{
              display: 'block',
              padding: '40px',
              border: '2px dashed #667eea',
              borderRadius: '8px',
              textAlign: 'center',
              cursor: 'pointer',
              background: '#f9f9f9',
              transition: 'all 0.3s ease',
            }}
          >
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={loading}
              style={{ display: 'none' }}
            />
            <div>
              <div style={{ fontSize: '40px', marginBottom: '10px' }}>📸</div>
              <p style={{ margin: '0 0 5px 0', fontWeight: 'bold' }}>
                Drop image here or click to browse
              </p>
              <p style={{ margin: '0', color: '#666', fontSize: '12px' }}>
                Supported: JPG, PNG | Max: 10MB | Retina fundus images recommended
              </p>
            </div>
          </label>
        </div>

        {preview && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontWeight: 'bold', marginBottom: '10px' }}>Preview:</p>
            <img
              src={preview}
              alt="Preview"
              style={{
                maxWidth: '100%',
                maxHeight: '300px',
                borderRadius: '8px',
                border: '1px solid #ddd',
              }}
            />
          </div>
        )}

        {error && (
          <div
            style={{
              color: '#dc3545',
              background: '#f8d7da',
              padding: '10px',
              borderRadius: '5px',
              marginBottom: '20px',
            }}
          >
            {error}
          </div>
        )}

        {loading && (
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '14px', marginBottom: '5px' }}>
              Processing: {Math.round(progress)}%
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                background: '#e0e0e0',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  background: 'linear-gradient(90deg, #667eea, #764ba2)',
                  width: `${progress}%`,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="submit"
            disabled={!file || loading}
            style={{
              flex: 1,
              padding: '12px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '5px',
              cursor: 'pointer',
              fontWeight: 'bold',
              opacity: !file || loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Processing...' : 'Analyze Image'}
          </button>
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              style={{
                flex: 1,
                padding: '12px',
                background: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                cursor: 'pointer',
                fontWeight: 'bold',
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
