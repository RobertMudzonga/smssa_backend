-- Migration: add forecasting fields to prospects for deal forecasting
ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS expected_payment_date DATE,
ADD COLUMN IF NOT EXISTS expected_closing_date DATE,
ADD COLUMN IF NOT EXISTS forecast_amount DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS forecast_probability INTEGER DEFAULT 50;

CREATE INDEX IF NOT EXISTS idx_prospects_expected_closing_date ON prospects (expected_closing_date);
CREATE INDEX IF NOT EXISTS idx_prospects_forecast_probability ON prospects (forecast_probability);
