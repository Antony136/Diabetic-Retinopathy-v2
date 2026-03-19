from pydantic import BaseModel


class ProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    title: str
    hospital_name: str
    phone: str
    board_certified: bool
    avatar_url: str
    stats: dict

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    name: str | None = None
    title: str | None = None
    hospital_name: str | None = None
    phone: str | None = None
    board_certified: bool | None = None
    avatar_url: str | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str
