-- New clips default to downloads off. Existing rows keep their current setting.
-- Application inserts always set allow_download explicitly.
UPDATE `clips` SET `allow_download` = `allow_download` WHERE 0;
