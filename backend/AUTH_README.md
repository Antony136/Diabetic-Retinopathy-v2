# JWT Authentication System

This backend includes a complete JWT-based authentication system with user registration and login endpoints.

## Setup

1. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment variables:**
   - Copy `.env.example` to `.env`
   - Update `SECRET_KEY` with a strong secret key
   - Configure `DATABASE_URL` if using PostgreSQL or other databases

3. **Run the backend:**
   ```bash
   uvicorn app.main:app --reload
   ```

## API Endpoints

### POST `/api/auth/register`
Register a new user.

**Request body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response (201):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com"
}
```

### POST `/api/auth/login`
Login and receive a JWT access token.

**Request body:**
```json
{
  "email": "john@example.com",
  "password": "securepassword123"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

### GET `/api/auth/me`
Get current authenticated user.

**Headers:**
```
Authorization: Bearer {access_token}
```

**Response (200):**
```json
{
  "id": 1,
  "name": "John Doe",
  "email": "john@example.com"
}
```

## Using Authentication in Protected Routes

You can use the `get_current_user` dependency in your routes:

```python
from fastapi import APIRouter, Depends
from app.api.auth import get_current_user
from app.models.users import User

router = APIRouter()

@router.get("/protected")
def protected_route(current_user: User = Depends(get_current_user)):
    return {"message": f"Hello {current_user.name}"}
```

## Token Details

- **Algorithm:** HS256
- **Expiration:** 30 minutes (configurable in `.env`)
- **Payload:** Contains user ID (`sub`) and email

## Password Security

Passwords are hashed using bcrypt with salt before storing in the database.

## Frontend Integration

When making requests from the frontend, include the access token in the Authorization header:

```javascript
const token = localStorage.getItem('access_token');
const response = await fetch('/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```
