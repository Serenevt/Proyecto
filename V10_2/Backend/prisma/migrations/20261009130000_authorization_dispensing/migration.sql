-- Nuevos estados y resultados de la reserva de saldo.
--
-- PostgreSQL no permite usar un valor de enum recién creado dentro de la misma
-- transacción que lo añade ("unsafe use of new value"). Por eso este archivo
-- solo declara los tipos: las columnas, restricciones e índices que sí los
-- consumen van en la migración siguiente, ya confirmada.

DO $$ BEGIN
  ALTER TYPE "AuthorizationStatus" ADD VALUE IF NOT EXISTS 'DISPENSING';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "AuthorizationOutcome" AS ENUM ('AUTO','MANUAL','CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;