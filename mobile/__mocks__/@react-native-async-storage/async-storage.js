// AsyncStorage 公式 Jest モックの再 export（architecture §12.4 / notes §6.1）。
// `.js` に置くことで tsc の型検査対象外にする（型定義が無いため。§12.4）。
// このファイルは `__mocks__` が node_modules と同階層にあるため、テストでは自動的に使われる。
module.exports = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
