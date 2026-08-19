-- Add base hull resource attributes for Fitting Bay.
ALTER TABLE "FittingHull" ADD COLUMN "cpuBase" DOUBLE PRECISION;
ALTER TABLE "FittingHull" ADD COLUMN "powergridBase" DOUBLE PRECISION;
ALTER TABLE "FittingHull" ADD COLUMN "calibrationCapacity" INTEGER;
ALTER TABLE "FittingHull" ADD COLUMN "turretHardpoints" INTEGER;
ALTER TABLE "FittingHull" ADD COLUMN "launcherHardpoints" INTEGER;
ALTER TABLE "FittingHull" ADD COLUMN "droneCapacity" DOUBLE PRECISION;
ALTER TABLE "FittingHull" ADD COLUMN "droneBandwidth" DOUBLE PRECISION;
