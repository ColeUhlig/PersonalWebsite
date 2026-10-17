import { highlightAll } from "./highlight.js";
import { createCalculator, tagSqlLegs } from "./calculator.js";
import { createLedger } from "./ledger.js";
import { createFailureStepper } from "./stepper.js";
import { SCENES } from "./scenes.js";

highlightAll();

const sqlPanel = document.getElementById("sql-split");
tagSqlLegs(sqlPanel);
createCalculator(document.getElementById("calc"), sqlPanel);
createLedger(document.getElementById("ledger-stepper"));

for (const figure of document.querySelectorAll(".failure[data-scene]")) {
  createFailureStepper(figure, SCENES[figure.dataset.scene]);
}
