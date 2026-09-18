-- Add formal notice date and scheduled move-out date for lease termination and deposit disposition
ALTER TABLE leases ADD COLUMN notice_date INTEGER;
ALTER TABLE leases ADD COLUMN move_out_date INTEGER;
