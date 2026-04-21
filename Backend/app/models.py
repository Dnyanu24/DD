
from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, Float, ForeignKey, Index, DDL
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

# Company Model 
class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    sectors = relationship("Sector", back_populates="company")
    users = relationship("User", back_populates="company")
    join_requests = relationship("CompanyJoinRequest", back_populates="company")

# Sector Model
class Sector(Base):
    __tablename__ = "sectors"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="sectors")
    products = relationship("Product", back_populates="sector")
    raw_data = relationship("RawData", back_populates="sector")
    users = relationship("User", back_populates="sector")

# Product Model
class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sector = relationship("Sector", back_populates="products")

# User Model (for roles)
class User(Base):
    __tablename__ = "users_roles"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False)  # sector_head, ceo
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)  # for sector_head
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="users")
    sector = relationship("Sector", back_populates="users")
    reviewed_requests = relationship("CompanyJoinRequest", back_populates="reviewer")
    profile = relationship("UserProfile", back_populates="user", uselist=False)
    password_reset_tokens = relationship("PasswordResetToken", back_populates="user")


class UserProfile(Base):
    __tablename__ = "user_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), unique=True, nullable=False)
    display_name = Column(String(255), nullable=True)
    email = Column(String(255), nullable=True, index=True)
    bio = Column(Text, nullable=True)
    avatar_filename = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="profile")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), nullable=False, index=True)
    token_hash = Column(String(128), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="password_reset_tokens")


class CompanyJoinRequest(Base):
    __tablename__ = "company_join_requests"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), nullable=False)
    password_hash = Column(String(255), nullable=False)
    requested_role = Column(String(50), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending, approved, rejected
    reviewed_by = Column(Integer, ForeignKey("users_roles.id"), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="join_requests")
    sector = relationship("Sector")
    reviewer = relationship("User", back_populates="reviewed_requests")

# Raw Data Model
class RawData(Base):
    __tablename__ = "raw_data"
    id = Column(Integer, primary_key=True, index=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    data = Column(JSON, nullable=False)  # Raw data as JSON
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    uploaded_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)

    sector = relationship("Sector", back_populates="raw_data")
    cleaned_data = relationship("CleanedData", back_populates="raw_data")
    extracted_datasets = relationship("ExtractedDataset", back_populates="raw_data", cascade="all, delete-orphan")


class ExtractedDataset(Base):
    __tablename__ = "extracted_datasets"
    id = Column(Integer, primary_key=True, index=True)
    raw_data_id = Column(Integer, ForeignKey("raw_data.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)  # invoice/products/customer/payment/table_*
    dataset_type = Column(String(255), nullable=False, default="table")
    data = Column(JSON, nullable=False)  # CSV-ready rows (list[dict])
    schema = Column(JSON, nullable=True)
    avg_record_confidence = Column(Float, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    raw_data = relationship("RawData", back_populates="extracted_datasets")

# Cleaned Data Model
class CleanedData(Base):
    __tablename__ = "cleaned_data"
    id = Column(Integer, primary_key=True, index=True)
    raw_data_id = Column(Integer, ForeignKey("raw_data.id"), nullable=False)
    cleaned_data = Column(JSON, nullable=False)
    cleaning_algorithm = Column(String(255), nullable=False)
    quality_score = Column(Float, nullable=False)
    cleaned_at = Column(DateTime, default=datetime.utcnow)

    raw_data = relationship("RawData", back_populates="cleaned_data")
    quality_scores = relationship("DataQualityScore", back_populates="cleaned_data")

# Data Quality Score Model
class DataQualityScore(Base):
    __tablename__ = "data_quality_scores"
    id = Column(Integer, primary_key=True, index=True)
    cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=False)
    score = Column(Float, nullable=False)
    algorithm = Column(String(255), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)

    cleaned_data = relationship("CleanedData", back_populates="quality_scores")

# AI Prediction Model
class AIPrediction(Base):
    __tablename__ = "ai_predictions"
    id = Column(Integer, primary_key=True, index=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)
    prediction_type = Column(String(255), nullable=False)  # e.g., sales_forecast, anomaly
    prediction_data = Column(JSON, nullable=False)
    confidence = Column(Float, nullable=False)
    predicted_at = Column(DateTime, default=datetime.utcnow)

    recommendations = relationship("AIRecommendation", back_populates="prediction")

# AI Recommendation Model
class AIRecommendation(Base):
    __tablename__ = "ai_recommendations"
    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("ai_predictions.id"), nullable=False)
    recommendation_text = Column(Text, nullable=False)
    explanation = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    prediction = relationship("AIPrediction", back_populates="recommendations")

# Report Model
class Report(Base):
    __tablename__ = "reports"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

# Feedback Log Model
class FeedbackLog(Base):
    __tablename__ = "feedback_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    data_id = Column(Integer, nullable=False)  # Could reference raw_data or cleaned_data
    feedback_type = Column(String(50), nullable=False)  # correction, validation
    feedback_data = Column(JSON, nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


class CompanyAnnouncement(Base):
    __tablename__ = "company_announcements"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(Text, nullable=False)
    created_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CompanyReport(Base):
    __tablename__ = "company_reports"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String(255), nullable=False)
    report_type = Column(String(100), nullable=False)
    payload = Column(JSON, nullable=False)
    created_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class UserSetting(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users_roles.id"), unique=True, nullable=False)
    settings = Column(JSON, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow)


class PipelineIterationLog(Base):
    __tablename__ = "pipeline_iteration_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True, index=True)
    task = Column(String(100), nullable=False, index=True)
    run_key = Column(String(255), nullable=False, index=True)
    iteration = Column(Integer, nullable=False, default=0)
    status = Column(String(30), nullable=False, default="completed", index=True)
    metrics = Column(JSON, nullable=False, default=dict)
    previous_metrics = Column(JSON, nullable=True)
    dataset_stats = Column(JSON, nullable=False, default=dict)
    cleaning_config = Column(JSON, nullable=False, default=dict)
    root_cause = Column(JSON, nullable=False, default=dict)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SavedCleanedDataset(Base):
    __tablename__ = "saved_cleaned_datasets"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users_roles.id"), nullable=False, index=True)
    source_cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=True, index=True)
    filename = Column(String(255), nullable=True)
    columns = Column(JSON, nullable=False, default=list)
    row_count = Column(Integer, nullable=False, default=0)
    data = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class MetaLearningExperience(Base):
    __tablename__ = "meta_learning_experiences"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    sector_id = Column(Integer, ForeignKey("sectors.id"), nullable=True, index=True)
    dataset_features = Column(JSON, nullable=False, default=dict)
    embedding = Column(JSON, nullable=False, default=list)
    best_config = Column(JSON, nullable=False, default=dict)
    best_model = Column(JSON, nullable=False, default=dict)
    best_metrics = Column(JSON, nullable=False, default=dict)
    source_cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class SectorClassificationProfile(Base):
    __tablename__ = "sector_classification_profiles"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    sector = Column(String(60), nullable=False, index=True)
    keywords = Column(JSON, nullable=False, default=list)
    samples = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=datetime.utcnow, index=True)

# Partitioning for RawData by sector and time
partition_by_sector_time = DDL("""
CREATE TABLE IF NOT EXISTS raw_data_y2023 PARTITION OF raw_data
    FOR VALUES FROM ('2023-01-01') TO ('2024-01-01');
CREATE TABLE IF NOT EXISTS raw_data_y2024 PARTITION OF raw_data
    FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');
""")

# Indexes for performance
Index('idx_sector_time', RawData.sector_id, RawData.uploaded_at)
Index('idx_cleaned_raw', CleanedData.raw_data_id)
Index('idx_prediction_sector', AIPrediction.sector_id)
Index('idx_feedback_user', FeedbackLog.user_id)
Index('idx_quality_cleaned', DataQualityScore.cleaned_data_id)

class ClusteringResult(Base):
    __tablename__ = "clustering_results"
    id = Column(Integer, primary_key=True, index=True)
    cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=False)
    cluster_labels = Column(JSON, nullable=False)
    cluster_centroids = Column(JSON, nullable=True)
    silhouette_score = Column(Float)
    n_clusters = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)

    cleaned_data = relationship("CleanedData", back_populates="clustering_results")

class ClassificationResult(Base):
    __tablename__ = "classification_results"
    id = Column(Integer, primary_key=True, index=True)
    cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=False)
    product_class = Column(String(100))
    sector_class = Column(String(60))
    hierarchical_level1 = Column(String(100))
    hierarchical_level2 = Column(String(100))
    hierarchical_level3 = Column(String(100))
    confidence_product = Column(Float)
    confidence_sector = Column(Float)
    confidence_hierarchical = Column(Float)
    source_method = Column(String(50))  # rule/ml/fusion
    created_at = Column(DateTime, default=datetime.utcnow)

    cleaned_data = relationship("CleanedData", back_populates="classification_results")

class FeedbackIteration(Base):
    __tablename__ = "feedback_iterations"
    id = Column(Integer, primary_key=True, index=True)
    cleaned_data_id = Column(Integer, ForeignKey("cleaned_data.id"), nullable=True)
    iteration = Column(Integer, nullable=False)
    confidence_weights = Column(JSON, default=dict)
    validation_errors = Column(JSON, default=dict)
    feedback_applied = Column(JSON, nullable=False)
    improved_score = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)

    cleaned_data = relationship("CleanedData", back_populates="feedback_iterations")

# Back-populate new relationships
CleanedData.clustering_results = relationship("ClusteringResult", back_populates="cleaned_data", cascade="all, delete-orphan")
CleanedData.classification_results = relationship("ClassificationResult", back_populates="cleaned_data", cascade="all, delete-orphan")
CleanedData.feedback_iterations = relationship("FeedbackIteration", back_populates="cleaned_data", cascade="all, delete-orphan")
