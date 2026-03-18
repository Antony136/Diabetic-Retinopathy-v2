import { useState, useEffect } from 'react'
import { LoginForm } from './components/LoginForm'
import { RegisterForm } from './components/RegisterForm'
import { Dashboard } from './components/Dashboard'
import { authService } from './services/authService'
import './App.css'

function App() {
  const [isLogin, setIsLogin] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    if (authService.isAuthenticated()) {
      setIsAuthenticated(true)
    }
    setLoading(false)
  }, [])

  const handleLoginSuccess = () => {
    setIsAuthenticated(true)
  }

  if (loading) {
    return (
      <div className="app-container">
        <div className="auth-container">
          <p style={{ textAlign: 'center', color: '#667eea', fontSize: '16px' }}>
            Loading...
          </p>
        </div>
      </div>
    )
  }

  // Show Dashboard if authenticated
  if (isAuthenticated) {
    return <Dashboard />
  }

  // Show Auth pages if not authenticated
  return (
    <div className="app-container">
      <div className="auth-container">
        <div className="auth-header">
          <h1>Diabetic Retinopathy Detection</h1>
          <p>Secure Authentication System</p>
        </div>

        <div className="auth-toggle">
          <button
            className={`toggle-btn ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
          >
            Login
          </button>
          <button
            className={`toggle-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
          >
            Register
          </button>
        </div>

        <div className="auth-form">
          {isLogin ? (
            <LoginForm onSuccess={handleLoginSuccess} />
          ) : (
            <RegisterForm onSuccess={() => setIsLogin(true)} />
          )}
        </div>

        <div className="auth-footer">
          <p>
            {isLogin ? "Don't have an account? " : 'Already have an account? '}
            <button
              className="link-btn"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Register' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}

export default App;