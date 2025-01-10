require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {Pool} = require('pg');
const {nanoid} = require('nanoid')

const client = new Client({
  authStrategy: new LocalAuth()
});
const pool = new Pool();

client.on('ready', async () => {
  try {
    console.log('Client WA Ready!');
  } catch (error) {
    console.log(error);
  }
});

client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

client.on('message_create', async (msg) => {
  const transaction = await pool.connect()
  try {
    const textReply = `Tolong di isi DENGAN LENGKAP terlebih dahulu:\nNo Badge lama: \nNo Badge baru: \nNama Lengkap: \nDepartemen: \nPerusahaan: \nBARAK dan No. Kamar lama: \nBARAK dan No. Kamar Baru : \n Silahkan Salin Dan Tempel Format Pesan Ini Dan Isi Setelah Tanda Titik Dua`
    if (msg.from.split('@')[0] === process.env.NOHPSERVER) {
      // Pesan Dari No Hp Server WA Tidak Di Proses
      throw {error: 'NO HP SERVER CANNOT MESSAGE CREATE', no_hp : msg.from.split('@')[0]}
    } else {
      const chatSplit = msg.body.split('\n').map(e => e.toLowerCase());
  
      const data = {
        old_badge : "",
        new_badge : "",
        fullName: "",
        department: "",
        company: "",
        old_room : "",
        new_room : ""
      };
  
      for (let i = 0; i < chatSplit.length; i++) {
        if (chatSplit[i].match("badge lama") !== null) {
          data.old_badge = chatSplit[i].split(":")[1].trim();
        }else if (chatSplit[i].match("badge baru") !== null) {
          data.new_badge = chatSplit[i].split(":")[1].trim();
        }else if (chatSplit[i].match("nama") !== null) {
          data.fullName = chatSplit[i].split(":")[1].trim();
        }else if (chatSplit[i].match("dep") !== null) {
          data.department = chatSplit[i].split(":")[1].trim();
        }else if (chatSplit[i].match("peru") !== null) {
          data.company = chatSplit[i].split(":")[1].trim();
        }else if (chatSplit[i].match("kamar lama") !== null) {
          data.old_room = chatSplit[i].split(":")[1].trim();
        }else if (chatSplit[i].match("kamar baru") !== null) {
          data.new_room = chatSplit[i].split(":")[1].trim();
        }
      }
  
      await transaction.query('BEGIN')

      const flag_new_badge = data.new_badge.trim() === "" ? true : false
      for (const key in data) {
        if (flag_new_badge && key === "new_badge") {
          msg.reply("Data Badge Baru Wajib Diisi.\nSilahkan Copy Paste Ulang Kembali Format Pendaftaran Camp Wifi dan Diisi Setelah Titik Dua (:)")
          msg.reply(textReply)
          throw {error : "new_badge Wajib Diisi", no_hp : msg.from.split('@')[0]}
        }
        if ((isNaN(data.new_badge) && key === "new_badge")) {
          msg.reply("No Badge Baru Wajib Angka. Jika Anda Karyawan Baru, Silahkan Mengisi Data No Badge Baru.\nSilahkan Copy Paste Ulang Kembali Format Pendaftaran Camp Wifi dan Diisi Setelah Titik Dua (:)")
          msg.reply(textReply)
          throw {error : "new_badge Wajib Diisi", no_hp : msg.from.split('@')[0]}
        }
      }

      // Pengecekkan No Hp Dan Pemilik Badge
      // Menampilkan Akun Yang Dimiliki
      const checkNoHp = 'select * from employee where no_hp = $1 and new_badge = $2';
      const valuesCheckNoHp = [msg.from.split('@')[0], data.new_badge];
      const resultCheckNoHp = await transaction.query(checkNoHp, valuesCheckNoHp)
  
      if (resultCheckNoHp.rows.length > 0) {
        const idEmployee = resultCheckNoHp.rows[0].id
        const clientReadySql =  'select vouchers.login_id, vouchers.password from employee_voucher inner join vouchers on employee_voucher.voucher_id = vouchers.id where employee_voucher.employee_id = $1';
        const clientReadyValue = [idEmployee]
        const clientReadyResult = await transaction.query(clientReadySql, clientReadyValue)
        msg.reply(`Username : ${clientReadyResult.rows[0].login_id}\nPassword : ${clientReadyResult.rows[0].password}`)
        throw {error: 'CLIENT ALREADY EXISTS', no_hp : valuesCheckNoHp[0]}
      }else{
        // Pengecekkan Kepemilikan Badge
        // Menampilkan Notifikasi Bahwa Badge Dimiliki Oleh No Hp Orang Lain
        const checkBadge = 'select * from employee where new_badge = $1';
        const valuesCheckBadge = [data.new_badge];
        const resultCheckBadge = await transaction.query(checkBadge, valuesCheckBadge)
        if(resultCheckBadge.rows.length > 0){
          const sensorNoHp = resultCheckBadge.rows[0].no_hp.split("").map((e, i) => {
            if(i >= Math.floor(resultCheckBadge.rows[0].no_hp.length / 2) && i < resultCheckBadge.rows[0].no_hp.length - 1){
              return '*'
            }
            return e
          })
          // Notif Ke Admin Jika Ada User Daftar Dengan Badge Yang Telah Terdaftar
          const num = await client.getNumberId(process.env.NOHPADMIN)
          await client.sendMessage(num._serialized, `Dari ${msg.from.split('@')[0]} Dapat Pesan Bahwa Badge Telah Terdaftar Dengan Nomor Hp ${resultCheckBadge.rows[0].no_hp}`)
          // ----
          msg.reply(`Badge Telah Terdaftar Dengan Nomor Hp ${sensorNoHp.join("")} Silahkan Menghubungi Admin!`)
          throw {error: 'CLIENT ALREADY EXISTS', no_hp : resultCheckBadge.rows[0].no_hp}
        } else{
          // Pengecekkan Nomor Hp
          // Menampilkan Akun Yang Dimiliki
          const checkNoHpAkun = 'select * from employee where no_hp = $1';
          const valuesCheckNoHpAkun = [msg.from.split('@')[0]];
          const resultCheckNoHpAkun = await transaction.query(checkNoHpAkun, valuesCheckNoHpAkun)
      
          if (resultCheckNoHpAkun.rows.length > 0) {
            const idEmployeeAkun = resultCheckNoHpAkun.rows[0].id
            const clientReadySqlAkun =  'select vouchers.login_id, vouchers.password from employee_voucher inner join vouchers on employee_voucher.voucher_id = vouchers.id where employee_voucher.employee_id = $1';
            const clientReadyValueAkun = [idEmployeeAkun]
            const clientReadyResultAkun = await transaction.query(clientReadySqlAkun, clientReadyValueAkun)
            msg.reply(`Username : ${clientReadyResultAkun.rows[0].login_id}\nPassword : ${clientReadyResultAkun.rows[0].password}`)
            throw {error: 'CLIENT ALREADY EXISTS', no_hp : valuesCheckNoHp[0]}
          }else{
            // Pengecekkan Ketersedian Voucher
            // Menampilkan Notif Jika Voucher Tidak Tersedia
            const resultCheckVoucher = await transaction.query('select * from vouchers where used = false');
            if (!resultCheckVoucher.rows.length) { // Pengecekkan Ketersedian Voucher WiFi
              msg.reply("Maaf Vouchernya Habis Kak, Bentar Ya Kak. Mimin Upload Vouchernya Dulu")
              throw {error: 'VOUCHER NOT AVAILABLE', no_hp : valuesCheckNoHp[0]}
            } else {
              // Proses Mencatat Data Karyawan, Voucher Dan Log Voucher Karyawan
              const insertEmployee = 'insert into employee (id, old_badge, new_badge, fullname, department, company, old_barrack_number, new_barrack_number, no_hp) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id';
              const valuesEmployee = [nanoid(8), data.old_badge, data.new_badge, data.fullName, data.department, data.company, data.old_room, data.new_room, valuesCheckNoHp[0]];
              const resultCheckEmployee = await transaction.query(insertEmployee, valuesEmployee);
      
              // Proses Update Data Voucher`Badge Telah Terdaftar Dengan Nomor Hp ${sensorNoHp.join(
              const updateVoucher = 'update vouchers set used = true where id = $1 returning id';
              const valuesUpdateVoucher = [resultCheckVoucher.rows[0].id]
              const resultUpdateVoucher = await transaction.query(updateVoucher, valuesUpdateVoucher)
      
              // Proses Mencatat Log Voucher Karyawan
              const insertEmployeeVoucher= 'insert into employee_voucher (id, employee_id, voucher_id, created_at) values ($1, $2, $3, $4) returning id';
              const valueEmployeeVoucher = [nanoid(8), resultCheckEmployee.rows[0].id, resultUpdateVoucher.rows[0].id, msg.timestamp]
              await transaction.query(insertEmployeeVoucher, valueEmployeeVoucher)
              msg.reply(`Username : ${resultCheckVoucher.rows[0].login_id}\nPassword : ${resultCheckVoucher.rows[0].password}`)
              await transaction.query('COMMIT')
              console.info({status : "Sukses Mengirim Pesan", no_hp : msg.from.split('@')[0]});
            }
          }
        }
      }

    }
  } catch (error) {
    console.log(error);
    await transaction.query('ROLLBACK')
  }finally{
    transaction.release()
  }
})

client.initialize();
