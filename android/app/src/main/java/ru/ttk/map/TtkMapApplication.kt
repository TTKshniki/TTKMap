package ru.ttk.map

import android.app.Application
import ru.ttk.map.core.database.TtkDatabase
import ru.ttk.map.core.network.TtkNetworkEnvironment
import ru.ttk.map.core.repository.TtkMapRepository

class TtkMapApplication : Application() {

    lateinit var networkEnvironment: TtkNetworkEnvironment
        private set

    lateinit var database: TtkDatabase
        private set

    lateinit var repository: TtkMapRepository
        private set

    override fun onCreate() {
        super.onCreate()
        networkEnvironment = TtkNetworkEnvironment(this)
        database = TtkDatabase.getInstance(this)
        repository = TtkMapRepository(
            network = networkEnvironment,
            db = database
        )
    }
}
