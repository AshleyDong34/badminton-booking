export type MembershipImportColumns = {
  email: string;
  studentId: string;
};

export const DEFAULT_MEMBERSHIP_IMPORT_COLUMNS: MembershipImportColumns = {
  email: "email",
  studentId: "student_id",
};

export type ClubChampsLevelImportColumns = {
  playerOneName: string;
  playerOneLevel: string;
  playerOneGender: string;
  playerTwoName: string;
  playerTwoLevel: string;
  playerTwoGender: string;
};

export type ClubChampsMixedImportColumns = {
  playerOneName: string;
  playerOneLevel: string;
  playerTwoName: string;
  playerTwoLevel: string;
};

export type ClubChampsPairImportColumns = {
  level: ClubChampsLevelImportColumns;
  mixed: ClubChampsMixedImportColumns;
};

export const DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS: ClubChampsPairImportColumns = {
  level: {
    playerOneName: "player_one_name",
    playerOneLevel: "player_one_level",
    playerOneGender: "player_one_gender",
    playerTwoName: "player_two_name",
    playerTwoLevel: "player_two_level",
    playerTwoGender: "player_two_gender",
  },
  mixed: {
    playerOneName: "player_one_name",
    playerOneLevel: "player_one_level",
    playerTwoName: "player_two_name",
    playerTwoLevel: "player_two_level",
  },
};

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function normalizeMembershipImportColumns(raw: unknown): MembershipImportColumns {
  const record = (raw ?? {}) as Record<string, unknown>;
  return {
    email: readString(record.email, DEFAULT_MEMBERSHIP_IMPORT_COLUMNS.email),
    studentId: readString(record.studentId, DEFAULT_MEMBERSHIP_IMPORT_COLUMNS.studentId),
  };
}

export function normalizeClubChampsPairImportColumns(raw: unknown): ClubChampsPairImportColumns {
  const record = (raw ?? {}) as Record<string, unknown>;
  const level = (record.level ?? {}) as Record<string, unknown>;
  const mixed = (record.mixed ?? {}) as Record<string, unknown>;

  return {
    level: {
      playerOneName: readString(
        level.playerOneName,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.level.playerOneName
      ),
      playerOneLevel: readString(
        level.playerOneLevel,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.level.playerOneLevel
      ),
      playerOneGender: readString(
        level.playerOneGender,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.level.playerOneGender
      ),
      playerTwoName: readString(
        level.playerTwoName,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.level.playerTwoName
      ),
      playerTwoLevel: readString(
        level.playerTwoLevel,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.level.playerTwoLevel
      ),
      playerTwoGender: readString(
        level.playerTwoGender,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.level.playerTwoGender
      ),
    },
    mixed: {
      playerOneName: readString(
        mixed.playerOneName,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.mixed.playerOneName
      ),
      playerOneLevel: readString(
        mixed.playerOneLevel,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.mixed.playerOneLevel
      ),
      playerTwoName: readString(
        mixed.playerTwoName,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.mixed.playerTwoName
      ),
      playerTwoLevel: readString(
        mixed.playerTwoLevel,
        DEFAULT_CLUB_CHAMPS_PAIR_IMPORT_COLUMNS.mixed.playerTwoLevel
      ),
    },
  };
}
