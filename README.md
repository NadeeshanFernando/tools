
# PostgreSQL Sync Tool

This tool helps you **sync a hosted PostgreSQL database into your local environment**.  
It supports testing connections, creating backups, restoring into local DBs, and comparing table counts.

---

## 📂 What’s in the folder
- **`sync_pg.py`** → the sync tool (double-click on RUN ME.bat or run in Command Prompt `py sync_pg.py`)  
- **`db.conf`** → configuration file (edit this with your DB details)  

---

## ⚙️ How to use
1. Place `sync_pg.py`, `RUN ME.bat` and `db.conf` together in any folder.  
2. Edit `db.conf` to match your DB credentials:
   ```ini
   HOST=host.example.com
   HOST_PORT=5432
   HOST_DBNAME=my_remote_db
   HOST_USER=postgres
   HOST_PASSWORD=secret
   HOST_SSL=prefer

   LOCAL=localhost
   LOCAL_PORT=5432
   LOCAL_DBNAME=my_local_db
   LOCAL_USER=postgres
   LOCAL_PASSWORD=secret
   LOCAL_SSL=prefer

   # Optional: if PostgreSQL tools aren’t in PATH, set this:
   # PG_BIN=C:\Program Files\PostgreSQL\16\bin
   ```
3. Run the tool:
   - Double-click `RUN ME.bat`
---

## 📋 Menu Options
1. Test HOST DB Connection  
2. Test LOCAL DB Connection  
3. Backup HOST DB → creates `backup.dump`  
4. Restore into LOCAL DB  
   - Option 1: Drop all tables and restore  
   - Option 2: Create a new DB and restore  
5. Compare table counts (schema = public)  
6. Exit  

---

## 🔧 Missing Dependencies?
- If Python dependencies are missing → the tool offers to auto-install them.  
- If PostgreSQL tools (`pg_dump`, `pg_restore`, `psql`, `createdb`) are missing:  
  - It will ask to **auto-install** using `winget`, `choco`, or `scoop` (Windows), or  
  - Let you enter the path to PostgreSQL’s `bin` folder → saved as `PG_BIN` in `db.conf`.  
  - Example:
    ```
    PG_BIN=C:\Program Files\PostgreSQL\16\bin
    ```

---

## 📦 What gets created
- **`backup.dump`** → backup file when you run option 3  

---

## ✅ Notes
- Passwords are used only for connections and passed via environment (`PGPASSWORD`), not shown in command line history.  
- Tested on Windows 10/11.  
- Works without installing Python (all included in exe).  
