"""Authentication endpoints — user registration and login."""

from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from loguru import logger

from ...database.config import get_db
from ...database.models import User
from ...auth.security import hash_password, verify_password, create_access_token, verify_token
from ..dependencies import get_current_user

router = APIRouter(prefix="/auth", tags=["authentication"])


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    # Accept either email or username
    email: str | None = None
    username: str | None = None
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    username: str


class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    created_at: str


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    request: RegisterRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Register a new user and return JWT token."""
    existing_user = db.query(User).filter(
        (User.username == request.username) | (User.email == request.email)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Користувач з цим ім'ям або email вже існує.",
        )

    hashed_pwd = hash_password(request.password)
    new_user = User(
        username=request.username,
        email=request.email,
        hashed_password=hashed_pwd,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    token = create_access_token(str(new_user.id), new_user.username)
    logger.info(f"Користувач '{request.username}' зареєстрований")

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=new_user.username,
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Login with email or username + password."""
    user = None

    if request.email:
        # Try email first
        user = db.query(User).filter(User.email == request.email).first()
        if not user:
            # Fall back to treating email field as username
            user = db.query(User).filter(User.username == request.email).first()
    elif request.username:
        user = db.query(User).filter(User.username == request.username).first()

    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неправильні облікові дані.",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Акаунт деактивовано.",
        )

    token = create_access_token(str(user.id), user.username)
    logger.info(f"Користувач '{user.username}' залогінився")

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=user.username,
    )


@router.post("/logout")
async def logout() -> dict:
    """Logout — client should discard the token."""
    return {"message": "Logged out"}


@router.get("/me", response_model=UserResponse)
async def get_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return current authenticated user profile."""
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.username,
        role="engineer",  # all users are engineers for demo
        created_at=current_user.created_at.isoformat(),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    current_user: User = Depends(get_current_user),
) -> TokenResponse:
    """Refresh JWT token."""
    token = create_access_token(str(current_user.id), current_user.username)
    return TokenResponse(
        access_token=token,
        token_type="bearer",
        username=current_user.username,
    )
