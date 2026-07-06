"""Pydantic base model that repairs mojibake in all string fields on validation."""

from __future__ import annotations

from pydantic import BaseModel, model_validator

from app.core.utils.text_encoding import repair_deep


class MojibakeSafeBase(BaseModel):
    @model_validator(mode="after")
    def _repair_mojibake_fields(self):
        repaired = repair_deep(self.model_dump())
        for key, value in repaired.items():
            if key in self.model_fields:
                object.__setattr__(self, key, value)
        return self
