var fs = require('fs');
var path = require('path');
var spawn = require('child_process').spawn;

function usleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n / 1000);
}

function Xvfb(options) {
  options = options || {};
  this._display = (options.displayNum || options.displayNum === 0 ? ':' + options.displayNum : null);
  this._reuse = options.reuse;
  this._timeout = options.timeout || 500;
  this._silent = options.silent;
  this._xvfb_args = options.xvfb_args || [];
}

Xvfb.prototype = {
  start: function(cb) {
    if (!this._process) {
      var lockFile = this._lockFile();

      this._setDisplayEnvVariable();

      fs.access(lockFile, fs.constants.F_OK, function(e) {
        var exists = !e;
        var didSpawnFail = false;
        try {
          this._spawnProcess(exists, function(e) {
            didSpawnFail = true;
            if (cb) cb(e);
          });
        } catch (e) {
          return cb && cb(e);
        }

        var totalTime = 0;
        (function checkIfStarted() {
          fs.access(lockFile, fs.constants.F_OK, function(e) {
            var exists = !e;
            if (didSpawnFail) {
              // When spawn fails, the callback will immediately be called.
              // So we don't have to check whether the lock file exists.
              return;
            }
            if (exists) {
              return cb && cb(null, this._process);
            } else {
              totalTime += 10;
              if (totalTime > this._timeout) {
                return cb && cb(new Error('Could not start Xvfb.'));
              } else {
                setTimeout(checkIfStarted.bind(this), 10);
              }
            }
          });
        }).bind(this)();
      }.bind(this));
    }
  },

  startSync: function() {
    if (!this._process) {
      var lockFile = this._lockFile();

      this._setDisplayEnvVariable();
      this._spawnProcess(fs.existsSync(lockFile), function(e) {
        // Ignore async spawn error. While usleep is active, tasks on the
        // event loop cannot be executed, so spawn errors will never be
        // received during the startSync call.
      });

      var totalTime = 0;
      while (!fs.existsSync(lockFile)) {
        if (totalTime > this._timeout) {
          throw new Error('Could not start Xvfb.');
        }
        usleep(10000);
        totalTime += 10;
      }
    }

    return this._process;
  },

  stop: function(cb) {
    if (this._process) {
      this._killProcess();
      this._restoreDisplayEnvVariable();

      var lockFile = this._lockFile();
      var totalTime = 0;
      (function checkIfStopped() {
        fs.access(lockFile, fs.constants.F_OK, function(e) {
          var exists = !e;
          if (!exists) {
            return cb && cb(null, this._process);
          } else {
            totalTime += 10;
            if (totalTime > this._timeout) {
              return cb && cb(new Error('Could not stop Xvfb.'));
            } else {
              setTimeout(checkIfStopped.bind(this), 10);
            }
          }
        });
      }).bind(this)();
    } else {
      return cb && cb(null);
    }
  },

  stopSync: function() {
    if (this._process) {
      this._killProcess();
      this._restoreDisplayEnvVariable();

      var lockFile = this._lockFile();
      var totalTime = 0;
      while (fs.existsSync(lockFile)) {
        if (totalTime > this._timeout) {
          throw new Error('Could not stop Xvfb.');
        }
        usleep(10000);
        totalTime += 10;
      }
    }
  },

  display: function() {
    if (!this._display) {
      var displayNum = 98;
      var lockFile;
      do {
        displayNum++;
        lockFile = this._lockFile(displayNum);
      } while (!this._reuse && fs.existsSync(lockFile));
      this._display = ':' + displayNum;
    }
    return this._display;
  },

  _setDisplayEnvVariable: function() {
    this._oldDisplay = process.env.DISPLAY;
    process.env.DISPLAY = this.display();
  },

  _restoreDisplayEnvVariable: function() {
    process.env.DISPLAY = this._oldDisplay;
  },

  _spawnProcess: function(lockFileExists, onAsyncSpawnError) {
    var display = this.display();
    if (lockFileExists) {
      if (!this._reuse) {
        throw new Error('Display ' + display + ' is already in use and the "reuse" option is false.');
      }
    } else {
      this._process = spawn('Xvfb', [ display ].concat(this._xvfb_args));
      this._process.stderr.on('data', function(data) {
        if (!this._silent) {
          process.stderr.write(data);
        }
      }.bind(this));
      // Bind an error listener to prevent an error from crashing node.
      this._process.once('error', function(e) {
        onAsyncSpawnError(e);
      });
    }
  },

  _killProcess: function() {
    this._process.kill();
    this._process = null;
  },

  _lockFile: function(displayNum) {
    displayNum = displayNum || this.display().toString().replace(/^:/, '');
    return '/tmp/.X' + displayNum + '-lock';
  }
}

module.exports = Xvfb;
