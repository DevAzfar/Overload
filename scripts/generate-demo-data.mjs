import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../src/demo-data");
mkdirSync(outputDirectory, { recursive: true });

const headers = [
  "schema_version", "workout_id", "workout_name", "started_at", "finished_at", "duration_seconds",
  "exercise_index", "exercise_id", "exercise_name", "muscle", "equipment", "set_index",
  "weight_kg", "reps", "rpe", "complete",
];

const exercise = {
  bench: ["bench", "Barbell Bench Press", "Chest", "Barbell"],
  pulldown: ["lat-pulldown", "Lat Pulldown", "Back", "Cable"],
  ohp: ["ohp", "Overhead Press", "Shoulders", "Barbell"],
  row: ["cable-row", "Seated Cable Row", "Back", "Cable"],
  squat: ["squat", "Back Squat", "Quadriceps", "Barbell"],
  rdl: ["rdl", "Romanian Deadlift", "Hamstrings", "Barbell"],
  splitSquat: ["split-squat", "Bulgarian Split Squat", "Quadriceps", "Dumbbell"],
  calf: ["calf", "Standing Calf Raise", "Calves", "Machine"],
  incline: ["incline-db", "Incline Dumbbell Press", "Chest", "Dumbbell"],
  curl: ["curl", "Cable Curl", "Biceps", "Cable"],
  triceps: ["triceps-pushdown", "Triceps Pushdown", "Triceps", "Cable"],
  legPress: ["leg-press", "Leg Press", "Quadriceps", "Machine"],
};

const set = (weight, reps, rpe = null, complete = true) => ({ weight, reps, rpe, complete });
const incomplete = (weight = null, reps = null, rpe = null) => set(weight, reps, rpe, false);
const movement = (definition, sets) => ({ definition, sets });

function addDays(date, days, hour = 18, minute = 0) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  next.setUTCHours(hour, minute, 0, 0);
  return next;
}

function workout(profile, index, name, startedAt, durationSeconds, exercises) {
  return {
    id: `demo-${profile}-${String(index + 1).padStart(2, "0")}`,
    name,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date(startedAt.getTime() + durationSeconds * 1000).toISOString(),
    durationSeconds,
    exercises,
  };
}

function beginnerProfile() {
  const base = new Date("2025-01-06T00:00:00.000Z");
  const workouts = [];
  for (let week = 0; week < 12; week += 1) {
    const benchWeight = 35 + week * 1.25 + ([0, 0, -1.25, 0.5][week % 4]);
    const squatWeight = 47.5 + week * 2.5 + (week % 5 === 3 ? -2.5 : 0);
    workouts.push(workout("beginner", workouts.length, "Upper foundations", addDays(base, week * 7 + 1, 18, 10), 3150 + (week % 3) * 180, [
      movement(exercise.bench, [set(benchWeight, 8, 7 + (week % 3) * 0.5), set(benchWeight, 7, 8), week === 4 ? incomplete(benchWeight, 6, 9) : set(benchWeight - 2.5, 9, null)]),
      movement(exercise.pulldown, [set(32.5 + week * 1.25, 10, 7.5), set(32.5 + week * 1.25, 9, null), set(30 + week * 1.25, 11, 8)]),
      movement(exercise.ohp, [set(20 + week * 0.75, 8, 8), set(20 + week * 0.75, 7, null), set(17.5 + week * 0.75, 10, 8.5)]),
      movement(exercise.curl, [set(10 + week * 0.5, 12, null), set(10 + week * 0.5, 10, 8), week === 8 ? incomplete() : set(9 + week * 0.5, 13, 8.5)]),
    ]));
    workouts.push(workout("beginner", workouts.length, "Lower foundations", addDays(base, week * 7 + 4, 17, 45), 3300 + (week % 4) * 150, [
      movement(exercise.squat, [set(squatWeight, 7, 7.5), set(squatWeight, 6, 8), set(squatWeight - 5, 9, week % 2 ? null : 8.5)]),
      movement(exercise.rdl, [set(45 + week * 2, 9, 7.5), set(45 + week * 2, 8, null), set(42.5 + week * 2, 10, 8.5)]),
      movement(exercise.splitSquat, [set(10 + week * 0.75, 10, 8), set(10 + week * 0.75, 9, null), week === 6 ? incomplete(10, null, null) : set(8 + week * 0.75, 12, 8.5)]),
      movement(exercise.calf, [set(35 + week * 2, 14, null), set(35 + week * 2, 12, 8), set(32.5 + week * 2, 15, 8.5)]),
    ]));
  }
  return workouts;
}

function plateauProfile() {
  const base = new Date("2025-04-07T00:00:00.000Z");
  const workouts = [];
  const topSets = [
    [70, 6], [72.5, 6], [75, 6], [77.5, 6],
    [77.5, 6], [80, 5], [77.5, 6], [80, 5], [77.5, 6],
    [82.5, 6], [85, 5], [87.5, 5],
  ];
  for (let week = 0; week < 12; week += 1) {
    const [topWeight, topReps] = topSets[week];
    const backoffReps = [8, 9, 7, 10, 8, 11][week % 6];
    workouts.push(workout("plateau", workouts.length, week < 9 ? "Bench development" : "Bench breakthrough", addDays(base, week * 7 + 1, 18, 20), 3900 + (week % 4) * 210, [
      movement(exercise.bench, [set(topWeight, topReps, 8 + (week % 3) * 0.5), set(topWeight - 12.5, backoffReps, week % 2 ? null : 8), week === 7 ? incomplete(topWeight - 15, 8, 9) : set(topWeight - 15, backoffReps + 1, 8.5)]),
      movement(exercise.incline, [set(24 + Math.floor(week / 3), 9 + (week % 2), 8), set(22 + Math.floor(week / 3), 11, null), set(22 + Math.floor(week / 3), 10, 8.5)]),
      movement(exercise.row, [set(55 + (week % 5) * 2.5, 10, 7.5), set(55 + (week % 5) * 2.5, 9, null), set(50 + (week % 5) * 2.5, 12, 8.5)]),
      movement(exercise.triceps, [set(25 + Math.floor(week / 4) * 2.5, 12, null), set(25 + Math.floor(week / 4) * 2.5, 10, 8), set(22.5 + Math.floor(week / 4) * 2.5, 14, 9)]),
    ]));
    workouts.push(workout("plateau", workouts.length, "Lower and back", addDays(base, week * 7 + 4, 17, 50), 3600 + (week % 3) * 240, [
      movement(exercise.squat, [set(100 + week * 1.25, 5 + (week % 2), 8), set(95 + week * 1.25, 7, null), set(90 + week * 1.25, 9, 8.5)]),
      movement(exercise.rdl, [set(90 + week * 1.5, 8, 8), set(90 + week * 1.5, 7, null), set(85 + week * 1.5, 10, 9)]),
      movement(exercise.pulldown, [set(60 + (week % 4) * 2.5, 9, 8), set(57.5 + (week % 4) * 2.5, 11, null), week === 5 ? incomplete() : set(55 + (week % 4) * 2.5, 12, 8.5)]),
      movement(exercise.calf, [set(75 + week, 12, null), set(75 + week, 11, 8), set(70 + week, 15, 9)]),
    ]));
  }
  return workouts;
}

function inconsistentProfile() {
  const base = new Date("2025-08-04T00:00:00.000Z");
  const dayOffsets = [0, 3, 9, 18, 20, 31, 37, 38, 51, 58, 65, 67, 74, 82, 83, 85, 90, 92, 94, 96, 98];
  const workouts = [];
  dayOffsets.forEach((dayOffset, index) => {
    const lower = index % 3 === 1;
    const mixed = index % 3 === 2;
    const wobble = [0, -5, 2.5, -2.5, 5, -7.5][index % 6];
    if (lower) {
      const squatWeight = 75 + index * 1.1 + wobble;
      workouts.push(workout("inconsistent", index, "Lower strength", addDays(base, dayOffset, 18 - (index % 2), 5 + (index % 4) * 10), 2850 + (index % 5) * 330, [
        movement(exercise.squat, [set(squatWeight, 5 + (index % 3), 7.5 + (index % 3) * 0.5), set(squatWeight - 5, 7, null), index === 10 ? incomplete(squatWeight - 10, null, null) : set(squatWeight - 10, 9, 9)]),
        movement(exercise.rdl, [set(70 + index * 1.2 + wobble, 8, 8), set(65 + index * 1.2, 9, null), set(62.5 + index, 11, 9)]),
        movement(exercise.legPress, [set(120 + index * 2.5, 10, null), set(120 + index * 2.5, 8, 8.5), set(110 + index * 2.5, 13, 9)]),
      ]));
    } else if (mixed) {
      workouts.push(workout("inconsistent", index, "Quick full body", addDays(base, dayOffset, 12, 15 + (index % 3) * 10), 2100 + (index % 4) * 240, [
        movement(exercise.bench, [set(52.5 + index * 0.7 + wobble, 7, 8), set(50 + index * 0.7, 8, null), index === 14 ? incomplete() : set(47.5 + index * 0.7, 10, 9)]),
        movement(exercise.squat, [set(72.5 + index * 1.05 + wobble, 6, 8), set(67.5 + index, 8, null), set(62.5 + index, 10, 9)]),
        movement(exercise.row, [set(47.5 + (index % 5) * 2.5, 10, 8), set(45 + (index % 5) * 2.5, 12, null), set(42.5 + (index % 5) * 2.5, 13, 9)]),
      ]));
    } else {
      const benchWeight = 55 + index * 0.65 + wobble;
      workouts.push(workout("inconsistent", index, "Upper strength", addDays(base, dayOffset, 19, index % 2 ? 20 : 0), 2700 + (index % 6) * 300, [
        movement(exercise.bench, [set(benchWeight, 5 + (index % 4), 8), set(benchWeight - 5, 8, null), set(benchWeight - 7.5, 10, 9)]),
        movement(exercise.pulldown, [set(45 + index * 0.8 + wobble / 2, 9, 8), set(42.5 + index * 0.8, 11, null), index === 9 ? incomplete() : set(40 + index * 0.8, 12, 9)]),
        movement(exercise.ohp, [set(30 + index * 0.45 + wobble / 3, 7, 8.5), set(27.5 + index * 0.45, 9, null), set(25 + index * 0.45, 11, 9)]),
        movement(exercise.curl, [set(15 + (index % 5), 10, null), set(14 + (index % 5), 12, 8.5), set(13 + (index % 5), 13, 9)]),
      ]));
    }
  });
  return workouts;
}

function escapeCell(value) {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(workouts) {
  const rows = [headers];
  workouts.forEach((entry) => {
    entry.exercises.forEach(({ definition, sets }, exerciseIndex) => {
      sets.forEach((workoutSet, setIndex) => {
        rows.push([
          "1", entry.id, entry.name, entry.startedAt, entry.finishedAt, entry.durationSeconds,
          exerciseIndex, ...definition, setIndex, workoutSet.weight, workoutSet.reps, workoutSet.rpe,
          workoutSet.complete,
        ]);
      });
    });
  });
  return `\uFEFF${rows.map((row) => row.map(escapeCell).join(",")).join("\r\n")}\r\n`;
}

const profiles = [
  ["beginner-progression.csv", beginnerProfile()],
  ["plateau-breakthrough.csv", plateauProfile()],
  ["inconsistent-training.csv", inconsistentProfile()],
];

profiles.forEach(([filename, workouts]) => {
  writeFileSync(resolve(outputDirectory, filename), toCsv(workouts), "utf8");
  console.log(`${filename}: ${workouts.length} workouts`);
});
