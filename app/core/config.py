from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # GMI Cloud
    gmi_api_key: str = ""
    gmi_base_url: str = "https://api.gmi-serving.com/v1"
    gmi_fast_model: str = "meta-llama/Llama-3.3-70B-Instruct"
    gmi_strong_model: str = "meta-llama/Llama-3.3-70B-Instruct"

    # HydraDB (agent session memory)
    hydradb_api_key: str = ""         # env: HYDRADB_API_KEY
    hydra_base_url: str = "https://api.hydradb.com"
    hydra_tenant_id: str = "gene-agent"

    # Database
    database_url: str = "sqlite:///./gene_agent.db"

    # Cache
    cache_ttl_seconds: int = 3600

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    log_level: str = "info"


settings = Settings()
