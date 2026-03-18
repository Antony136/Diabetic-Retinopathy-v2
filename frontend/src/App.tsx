import { useState } from 'react'
import { LoginForm } from './components/LoginForm'
import { RegisterForm } from './components/RegisterForm'
import './App.css'

function App() {
  const [isLogin, setIsLogin] = useState(true)

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
            <LoginForm onSuccess={() => setIsLogin(true)} />
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